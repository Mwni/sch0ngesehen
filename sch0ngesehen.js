// MWNI MAG DAS PROGRAMM <3

const DEBUG = false
const CHUNK_SIZE = 256


class App{
	static init(){
		log('[App] initializing')

		Storage.load()

		this.stream = null
		this.streamLastItem = null
		this.discovered = []
		this.currentActive = null
		this.url = null

		window.addEventListener('scroll', () => this.checkStreamExtension(), true)
		window.addEventListener('click', () => this.scheduleStateCheck(), true)
		window.addEventListener('touchend', () => this.scheduleStateCheck(), true)
		window.addEventListener('resize', () => this.scheduleStateCheck(), true)
		window.addEventListener('keydown', e => [65, 68, 37, 39].includes(e.keyCode) && this.scheduleStateCheck(), true)

		this.checkState()
	}

	static scheduleStateCheck(){
		if(this.checkTimeout){
			clearTimeout(this.checkTimeout)
		}

		this.checkTimeout = setTimeout(() => this.checkState(), 50)
	}

	static checkState(){
		if(!this.isOnSubjectPage())
			return

		if(window.location.href === this.url)
			return

		if(this.isLoading()){
			log('[App] content is loading. polling...')
			this.scheduleStateCheck()
			return
		}

		let stream = document.getElementById('stream')

		if(stream !== this.stream || (this.streamLastItem && !this.streamLastItem.parentElement)){
			this.mountNewStream(stream)
		}

		this.updateCurrentlyViewed()
	}

	static checkStreamExtension(){
		if(!this.stream)
			return

		let last = this.stream.children[this.stream.children.length - 1]

		if(last !== this.streamLastItem){
			this.streamLastItem = last
			this.sweep()
		}
	}

	static mountNewStream(stream){
		log('[App] mounting stream')

		this.stream = stream
		this.streamLastItem = this.stream.children[this.stream.children.length - 1]

		if(!this.streamLastItem.className.indexOf('stream-row') === -1){
			this.streamLastItem = Array.from(this.stream.children).reverse().find(el => el.className.indexOf('stream-row') >= 0)
		}

		this.discovered = []
		this.sweep()
	}

	static updateCurrentlyViewed(){
		let thumb = document.querySelector('a.thumb.active')
		let id = null

		if(thumb){
			id = this.getItemIdFromThumb(thumb)
			Storage.seen(id)
		}

		if(this.currentActive){
			if(id === this.getItemIdFromThumb(this.currentActive))
				return

			this.markSeen(this.currentActive)
		}

		this.currentActive = thumb
	}

	static sweep(){
		log('[App] sweeping')

		let thumbs = Array.from(document.querySelectorAll('#stream a.thumb'))

		thumbs.forEach(thumb => {
			let id = parseInt(thumb.id.split('-')[1])

			if(this.discovered.includes(id))
				return

			if(Storage.check(id)){
				this.markSeen(thumb)
			}

			this.discovered.push(id)
		})
	}

	static markSeen(thumb){
		if(thumb.className.indexOf('seen') !== -1)
			return

		let span = document.createElement('span')

		span.className = 'seen-marker'

		thumb.appendChild(span)
		thumb.className += ' seen'
	}

	static isOnSubjectPage(){
		let url = window.location.href
		let path = url.split('/').slice(3).join('/')

		return path === '' || path.indexOf('top') === 0 || path.indexOf('new') === 0
	}

	static isLoading(){
		return !document.getElementById('stream') || !!document.querySelector('#loader')
	}

	static getItemIdFromThumb(thumb){
		return parseInt(thumb.id.split('-')[1])
	}
}



class Storage{
	static load(){
		log('[Storage] loading...')

		this.itemPrefix = 'sch0ngesehen_'
		this.index = this.loadJSON('index')
		this.chunks = []
		this.currentChunk = null

		if(this.index){
			for(let i=0; i<this.index.chunks; i++){
				this.loadChunk(i)
			}

			this.currentChunk = this.chunks.find(chunk => !chunk.isFull())

			log('[Storage] loaded ' + this.chunks.length + ' chunks')
		}else{
			this.setEmptyIndex()

			log('[Storage] no index, yet. starting empty')
		}
	}

	static setEmptyIndex(){
		this.index = {
			chunkSize: CHUNK_SIZE,
			chunks: 0
		}
	}

	static nuke(){
		window.localStorage.removeItem(this.itemPrefix + 'index')

		this.chunks.forEach(chunk => {
			window.localStorage.removeItem(this.itemPrefix + 'chunk' + chunk.id)
		})

		this.currentChunk = null
		this.chunks = []
		this.setEmptyIndex()

		log('[Storage] deleted all data')
	}

	static check(id){
		return this.chunks.some(chunk => chunk.has(id))
	}

	static seen(id){
		if(this.check(id))
			return false

		if(!this.currentChunk || this.currentChunk.isFull()){
			this.newChunk()
		}

		this.currentChunk.add(id)

		log('[Storage] marked', id, 'as seen')

		this.flush()

		return true
	}

	static loadChunk(id){
		let encoded = this.loadString('chunk' + id)

		if(!encoded){
			log('[Storage] chunk', id, 'does not exist')
			return
		}

		let chunk = Chunk.fromEncoded(encoded)

		chunk.id = id

		this.chunks.push(chunk)
	}

	static newChunk(){
		let chunk = new Chunk(CHUNK_SIZE)

		chunk.id = this.index.chunks

		this.chunks.push(chunk)
		this.currentChunk = chunk
		this.index.chunks++
		this.storeJSON('index', this.index)

		log('[Storage] created new chunk and updated index')
	}

	static flush(){
		this.storeString('chunk' + this.currentChunk.id, this.currentChunk.encode())

		log('[Storage] flushed')
	}

	static loadJSON(id){
		let str = window.localStorage.getItem(this.itemPrefix + id)

		if(!str)
			return null

		return JSON.parse(str)
	}

	static storeJSON(id, data){
		window.localStorage.setItem(this.itemPrefix + id, JSON.stringify(data))
	}

	static loadString(id){
		return window.localStorage.getItem(this.itemPrefix + id)
	}

	static storeString(id, str){
		window.localStorage.setItem(this.itemPrefix + id, str)
	}
}

class Chunk{
	static fromEncoded(encoded){
		let chunk = new Chunk(CHUNK_SIZE)
		let binary = (encoded)

		for(let i=0; i<binary.length; i++){
			chunk.codingView[i] = binary.charCodeAt(i)
		}

		chunk.recalcLength()

		return chunk
	}

	constructor(size){
		this.size = size
		this.buffer = new ArrayBuffer(4 * size)
		this.view = new Uint32Array(this.buffer)
		this.codingView = new Uint8Array(this.buffer)
		this.length = 0
	}

	has(id){
		for(let i=0; i<this.length; i++){
			if(this.view[i] === id)
				return true
		}

		return false
	}

	add(id){
		this.view[this.length] = id
		this.length++
	}

	isFull(){
		return this.length >= this.size
	}

	recalcLength(){
		this.length = this.view.findIndex(b => b === 0)

		if(this.length === -1)
			this.length = this.size
	}

	encode(){
		return (String.fromCharCode.apply(null, this.codingView))
	}
}

function log(){
	if(DEBUG)
		console.log.apply(console, arguments)
}

App.init()