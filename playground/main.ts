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
			if (artwork.sizes && !isNaN(parseInt(artwork.sizes.split('x')[0]))) {
				if (parseInt(artwork.sizes.split('x')[0]) > size) {
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
		if (artwork.sizes && !isNaN(parseInt(artwork.sizes.split('x')[0]))) {
			if (parseInt(artwork.sizes.split('x')[0]) > size) {
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
