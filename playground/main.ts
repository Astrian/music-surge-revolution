import './reset.css'
import './style.css'

import { Player } from '../src'

const playerInstance = new Player()

playerInstance.onQueueChange((queue) => {
	let list_html = ''

	for (const item of queue) {
		let artwork_url = ''
		const size = 0
		for (const artwork of item.metadata?.artwork ?? []) {
			if (artwork.sizes && !Number.isNaN(parseInt(artwork.sizes.split('x')[0], 10))) {
				if (parseInt(artwork.sizes.split('x')[0], 10) > size) {
					artwork_url = artwork.src
				}
			} else if (artwork_url !== '') {
				artwork_url = artwork.src
			}
		}
		list_html += `<div class="queue_item">
						<div class="artwork">
							${artwork_url === '' ? '' : `<img src="${artwork_url}" />`}
						</div>
						<div class="text_content">
							<div class="title">${item.metadata?.title ?? 'Unknown title'}</div>
							<div class="secondary">${item.metadata?.artist ?? 'Unknown artist'} — ${item.metadata?.album ?? 'Unknown album'}</div>
						</div>
					</div>`
	}

	document.getElementById('queue')!.innerHTML = list_html
})

playerInstance.onPlayStateChange((state) => {
	if (state) document.getElementById('play_pause_btn')!.innerHTML = `<i class="ri-pause-fill"></i>`
	else document.getElementById('play_pause_btn')!.innerHTML = `<i class="ri-play-fill"></i>`
})

playerInstance.replaceQueue([
	{
		url: 'https://res01.hycdn.cn/bd83b36037f79a179b5e045dad7a5838/68AE5910/siren/audio/20230626/85b64e95ff0d08df772fb43539c369e4.wav',
	},
	{
		url: 'https://res01.hycdn.cn/073dc3fd70edfadd1362aa51c7a0d6c3/68AE58EA/siren/audio/20230626/eddcb4bf086109df1305ee5ee6f96d64.wav',
	},
	{
		url: '/sample1.wav',
		metadata: {
			title: 'Bad Mushroom',
			artist: 'FatGuy & DRobot',
			album: 'Bad Mushroom - Single',
			artwork: [
				{
					src: '/artwork1.jpg',
					sizes: '500x500',
					type: 'image/jpeg',
				},
			],
		},
	},
	{
		url: '/sample2.wav',
		metadata: {
			title: 'Oops! (HEM Selection 2024)',
			artist: 'CapG',
			album: 'HEM Selection 2024',
			artwork: [
				{
					src: '/artwork2.png',
					sizes: '500x500',
					type: 'image/png',
				},
			],
		},
	},
	{
		url: '/sample3.wav',
		metadata: {
			title: 'The Moss',
			artist: 'Cosmo Sheldrake',
			album: 'The Moss / Solar',
			artwork: [
				{
					src: '/artwork3.jpg',
					sizes: '500x500',
					type: 'image/jpeg',
				},
			],
		},
	},
])

document.getElementById('play_pause_btn')?.addEventListener('click', () => {
	playerInstance.togglePlaying()
})

playerInstance.onCurrentPlayingChange((track: QueueItem) => {
	console.log(track)

	// Attach artwork
	let artwork_url = ''
	const size = 0
	for (const artwork of track.metadata?.artwork ?? []) {
		if (artwork.sizes && !Number.isNaN(parseInt(artwork.sizes.split('x')[0], 10))) {
			if (parseInt(artwork.sizes.split('x')[0], 10) > size) {
				artwork_url = artwork.src
			}
		} else if (artwork_url !== '') {
			artwork_url = artwork.src
		}
	}
	if (artwork_url !== '') document.getElementById('artwork')!.innerHTML = `<img src="${artwork_url}" alt="Artwork" />`
	else document.getElementById('artwork')!.innerHTML = ``

	// Attach track title
	if (track.metadata?.title) document.getElementById('track_title')!.innerText = track.metadata.title
	else document.getElementById('track_title')!.innerText = 'Unknown track title'

	// Attach artist and album
	let artist = 'Unknown artist'
	let album = 'Unknown album'

	if (track.metadata?.artist) artist = track.metadata.artist

	if (track.metadata?.album) album = track.metadata.album

	document.getElementById('track_secondary')!.innerText = `${artist} — ${album}`
})

playerInstance.onProgressChange((progress) => {
	document.getElementById('progress_bar_inner')!.style.width = `${progress.percentage}%`

	const currentTimeMin = Math.floor(progress.currentTime / 60)
	const currentTimeSec = Math.floor(progress.currentTime) % 60

	document.getElementById('current_time')!.innerText =
		`${currentTimeMin}:${currentTimeSec < 10 ? `0${currentTimeSec}` : currentTimeSec}`

	const leftTime = Math.floor(progress.duration) - Math.floor(progress.currentTime)

	const leftTimeMin = Math.floor(leftTime / 60)
	const leftTimeSec = Math.floor(leftTime) % 60

	document.getElementById('left_time')!.innerText =
		`-${leftTimeMin}:${leftTimeSec < 10 ? `0${leftTimeSec}` : leftTimeSec}`
})

document.getElementById('rewind_btn')?.addEventListener('click', () => {
	playerInstance.skipToPrevious()
})

document.getElementById('forward_btn')?.addEventListener('click', () => {
	playerInstance.skipToNext()
})

playerInstance.onShuffleChange((state) => {
	if (state) document.getElementById('shuffle_btn')!.style.color = 'black'
	else document.getElementById('shuffle_btn')!.style.color = 'gray'
})

document.getElementById('shuffle_btn')?.addEventListener('click', () => {
	playerInstance.toggleShuffle()
})

document.getElementById('loop_btn')?.addEventListener('click', () => {
	playerInstance.toggleLoop()
})

playerInstance.onLoopChange((state) => {
	switch (state) {
		case 'off':
			document.getElementById('loop_btn')!.innerHTML = '<i class="ri-repeat-2-line"></i>'
			document.getElementById('loop_btn')!.style.color = 'gray'
			break
		case 'entire_queue':
			document.getElementById('loop_btn')!.style.color = 'black'
			break
		case 'single_track':
			document.getElementById('loop_btn')!.innerHTML = '<i class="ri-repeat-one-line"></i>'
			break
	}
})

document.getElementById('add_track_btn')?.addEventListener('click', () => {
	playerInstance.appendTrack({
		url: '/sample4.wav',
		metadata: {
			title: '自己跳舞指南（2022 Remaster）',
			artist: '梁欢',
			album: '我们去未来（2022 Remaster）',
			artwork: [
				{
					src: 'artwork4.jpg',
					sizes: '3000x3000',
					type: 'image/jpeg',
				},
			],
		},
	})
})

// Progress bar click to seek
const progressBar = document.getElementById('progress_bar')
let isDragging = false

// Click to seek
progressBar?.addEventListener('click', (e: MouseEvent) => {
	if (isDragging) return // Don't seek on click if we're dragging

	const rect = progressBar.getBoundingClientRect()
	const clickX = e.clientX - rect.left
	const percentage = (clickX / rect.width) * 100

	// Clamp to 0-100
	const clampedPercentage = Math.max(0, Math.min(100, percentage))

	// Seek to the calculated percentage
	const success = playerInstance.seekToPercentage(clampedPercentage)

	if (success) {
		console.log(`Seeked to ${clampedPercentage.toFixed(1)}%`)
	}
})

// Drag to seek functionality
progressBar?.addEventListener('mousedown', (e: MouseEvent) => {
	isDragging = true
	const rect = progressBar.getBoundingClientRect()

	// Calculate initial percentage
	const clickX = e.clientX - rect.left
	const percentage = (clickX / rect.width) * 100
	const clampedPercentage = Math.max(0, Math.min(100, percentage))

	// Immediately seek to the position
	playerInstance.seekToPercentage(clampedPercentage)

	// Handle dragging
	const handleMouseMove = (moveEvent: MouseEvent) => {
		if (!isDragging) return

		const moveX = moveEvent.clientX - rect.left
		const movePercentage = (moveX / rect.width) * 100
		const clampedMovePercentage = Math.max(0, Math.min(100, movePercentage))

		// Update the progress bar visually (optional - for immediate feedback)
		const progressBarInner = document.getElementById('progress_bar_inner')
		if (progressBarInner) {
			progressBarInner.style.width = `${clampedMovePercentage}%`
		}

		// Seek to the new position
		playerInstance.seekToPercentage(clampedMovePercentage)
	}

	const handleMouseUp = () => {
		isDragging = false
		document.removeEventListener('mousemove', handleMouseMove)
		document.removeEventListener('mouseup', handleMouseUp)
	}

	// Add listeners to document to handle dragging outside the progress bar
	document.addEventListener('mousemove', handleMouseMove)
	document.addEventListener('mouseup', handleMouseUp)
})

// Prevent text selection while dragging
progressBar?.addEventListener('selectstart', (e) => {
	if (isDragging) {
		e.preventDefault()
	}
})
