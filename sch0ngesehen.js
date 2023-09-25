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

	static checkSettings(){
		if(!this.isOnSettingsPage())
			return

		if(this.isLoading()){
			log('[App] settings page is loading. polling...')
			setTimeout(() => this.checkSettings(), 100)
			return
		}

		Settings.init()
	}

	static scheduleStateCheck(){
		if(this.checkTimeout){
			clearTimeout(this.checkTimeout)
		}

		this.checkTimeout = setTimeout(() => this.checkState(), 50)
	}

	static checkState(){
		if(window.location.href === this.url)
			return

		log('[App] check state')

		if(this.isLoading()){
			log('[App] content is loading. polling...')
			this.scheduleStateCheck()
			return
		}

		this.url = window.location.href

		if(this.isOnSubjectPage()){
			let stream = document.getElementById('stream')

			if(stream !== this.stream || (this.streamLastItem && !this.streamLastItem.parentElement)){
				this.mountNewStream(stream)
			}

			this.updateCurrentlyViewed()
		}

		if(this.isOnSettingsPage()){
			Settings.attach()
		}
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

	static isOnSettingsPage(){
		return window.location.href.includes('/settings/')
	}

	static isOnSubjectPage(){
		let url = window.location.href
		let path = url.split('/').slice(3).join('/')

		return path === '' || path.indexOf('top') === 0 || path.indexOf('new') === 0
	}

	static isLoading(){
		let mainView = document.getElementById('main-view')

		return !mainView || mainView.children.length === 0 || !!document.querySelector('#loader')
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

	static getTotalCount(){
		let n = 0

		this.chunks.forEach(chunk => n += chunk.length)

		return n
	}

	static getTotalMemory(){
		let n = 0

		this.chunks.forEach(chunk => n += 4 * CHUNK_SIZE)

		return n
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

	static export(){
		let encoded = JSON.stringify(this.index) + '\r\n'

		this.chunks.forEach(chunk => {
			encoded += chunk.id + ':' + btoa(chunk.encode()) + '\r\n'
		})

		return encoded
	}

	static import(encoded){
		try{
			let lines = encoded.split('\r\n')
			let index = JSON.parse(lines[0])

			if(!index.chunkSize || !index.chunks)
				return false

			for(let i=0; i<index.chunks; i++){
				let split = lines[i+1].split(':')
				let b = split[1]
				let chunk = Chunk.fromEncoded(atob(b))

				for(let u=0; u<chunk.length; u++){
					this.seen(chunk.view[u])
				}
			}

			return true
		}catch(e){
			log(e)
			return false
		}
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

class Settings{
	static attach(){
		let exists = document.querySelector('#sch0ngesehen-settings')

		if(!exists)
			new Settings()
	}

	constructor(){
		this.tabBar = document.querySelector('#main-view .tab-bar')
		this.pane = document.querySelector('#main-view .pane')

		this.link = document.createElement('a')
		this.link.id = 'sch0ngesehen-settings'
		this.link.href = '#'
		this.link.textContent = 'sch0ngesehen'
		this.link.addEventListener('click', e => {
			e.preventDefault()
			this.open()
		})

		this.tabBar.insertBefore(this.link, this.tabBar.querySelector('span'))

		log('[Settings] attached')
	}

	open(){
		Array.from(this.tabBar.querySelectorAll('a')).forEach(a => a.classList.remove('active'))
		this.link.classList.add('active')

		this.pane.innerHTML = ''
		this.pane.append(this.createPanel())
	}

	offerExportedDownload(){
		let trigger = document.createElement('a')
		let text = Storage.export()
		trigger.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
		trigger.setAttribute('download', 'sch0ngesehen-verlauf.txt');

		trigger.style.display = 'none';
		document.body.appendChild(trigger)
		trigger.click()
		document.body.removeChild(trigger)
	}

	import(upload){
		let reader = new FileReader()

		reader.onload = () => {
			if(!Storage.import(reader.result)){
				alert('Die Datei hat ein unerwartetes Format und kann nicht importiert werden. Hast du die richtige Datei ausgwählt?')
				upload.value = ''
			}else{
				setTimeout(() => alert('Der Import war erfolgreich.'), 0)
				this.open()
			}
		}

		reader.readAsText(upload.files[0])
	}

	offerArmageddon(){
		if(confirm('Möchtest du den gesamten Verlauf wirklich löschen? Dies ist irreversibel!')){
			Storage.nuke()
			this.open()
		}
	}


	createPanel(){
		let panel = document.createElement('div')
		let info = document.createElement('p')
		let exportButton = this.createButton('Verlauf exportieren (.txt)')
		let importButton = this.createButton('Verlauf importieren (.txt)')
		let nukeButton = this.createButton('Verlauf löschen')
		let upload = document.createElement('input')

		info.innerHTML 	= 'Insgesamt ' + Storage.getTotalCount().toLocaleString() + ' Hochlads angesehen.'
						+ '<br>'
						+ 'Lokaler Speicherbedarf: ' + this.formatBytes(Storage.getTotalMemory()) + '.'


		exportButton.addEventListener('click', () => this.offerExportedDownload())
		importButton.addEventListener('click', () => upload.click())
		nukeButton.addEventListener('click', () => this.offerArmageddon())

		upload.type = 'file'
		upload.accept = 'text/plain'
		upload.setAttribute('hidden', '1')
		upload.addEventListener('change', () => this.import(upload))

		panel.append(info)
		panel.append(exportButton)
		panel.append(importButton)
		panel.append(nukeButton)
		panel.append(upload)

		return panel
	}

	createButton(label){
		let button = document.createElement('input')

		button.type = 'button'
		button.classList.add('confirm')
		button.value = label
		button.style.display = 'block'
		button.style.marginTop = '10px'

		return button
	}

	formatBytes(b){
		if(b < 1000)
			return b.toLocaleString() + ' Bytes'
		else if(b < 1000 * 1000)
			return Math.round(b/1000) + ' KB'
		else
			return Math.round(b/(1000 * 1000)) + ' MB'
	}
}

function log(){
	if(DEBUG)
		console.log.apply(console, arguments)
}

App.init()