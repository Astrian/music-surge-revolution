import log from './debug'

type PlayStateChangeListener = (isPlaying: boolean) => void
type QueueChangeListener = (queue: QueueItem[]) => void

class Player {
	private queue: QueueItem[]
	private isPlaying: boolean
	private playStateListeners: Set<PlayStateChangeListener>
	private queueChangeListeners: Set<QueueChangeListener>
	private context: AudioContext
	private currentSource: MediaElementAudioSourceNode | null
	private currentAudio: HTMLAudioElement | null
	private nextSource: MediaElementAudioSourceNode | null
	private nextAudio: HTMLAudioElement | null
	private currentPlayingPointer: number

	/**
	 * Create a new player instance.
	 * @constructor
	 */
	constructor() {
		this.queue = []
		this.isPlaying = false
		this.playStateListeners = new Set()
		this.queueChangeListeners = new Set()
		this.context = new AudioContext()
		this.currentSource = null
		this.currentAudio = null
		this.nextSource = null
		this.nextAudio = null
		this.currentPlayingPointer = 0
	}

	/**
	 * Replace the play queue with a new queue.
	 * @param queue The new play queue array.
	 */
	replaceQueue = (queue: QueueItem[]) => {
		this.queue = queue
		this.notifyQueueChange()
	}

	/**
	 * Fetch the current play queue.
	 * @returns A deep copy of the current play queue to prevent external modification.
	 */
	fetchQueue = (): QueueItem[] => {
		return structuredClone(this.queue)
	}

	/**
	 * Subscribe to play state changes.
	 * @param listener Callback function that will be called when play state changes.
	 * @returns Destroy function to remove the listener.
	 */
	onPlayStateChange = (listener: PlayStateChangeListener): { destroy: () => void } => {
		this.playStateListeners.add(listener)
		return {
			destroy: () => {
				this.playStateListeners.delete(listener)
			},
		}
	}

	/**
	 * Set the playing state and notify all listeners.
	 * @param playing The new playing state.
	 */
	togglePlaying = async (playing?: boolean) => {
		const newState = playing !== undefined ? playing : !this.isPlaying
		if (this.isPlaying === newState) return
		this.isPlaying = newState
		log.player(`Play state changed to: ${newState}`)
		this.playStateListeners.forEach((listener) => {
			listener(newState)
		})
		this.reportMetadata()
		if (newState) {
			try {
				await this.startPlay()
			} catch (error) {
				log.player('Failed to start playback:', error)
				// Playback failed, state already reset in startPlay if needed
			}
		} else {
			this.pausePlay()
		}
	}

	/**
	 * Get the current playing state.
	 * @returns Current playing state.
	 */
	getPlayingState = (): boolean => {
		return this.isPlaying
	}

	/**
	 * Skip to the next track in the queue.
	 */
	skipToNext = async () => {
		if (this.currentPlayingPointer + 1 < this.queue.length) {
			log.player('Skipping to next track')

			// Clean up current audio first
			if (this.currentAudio) {
				this.currentAudio.pause()
				this.currentAudio.removeEventListener('ended', () => {})
				this.currentAudio.removeEventListener('timeupdate', () => {})
				this.currentAudio = null
				this.currentSource = null
			}

			// Clean up next audio if exists
			if (this.nextAudio) {
				this.nextAudio = null
				this.nextSource = null
			}

			// Move to next track and start playing
			this.currentPlayingPointer++
			await this.startPlay()
		} else {
			log.player('No next track available')
		}
	}

	/**
	 * Skip to the previous track in the queue.
	 */
	skipToPrevious = async () => {
		// If current track has played less than 5 seconds, go to previous track
		// Otherwise, restart the current track
		if ((this.currentAudio?.currentTime ?? 0) < 5 && this.currentPlayingPointer > 0) {
			log.player('current play progress is less than 5 secs')
			if (this.currentPlayingPointer > 0) {
				log.player('Skipping to previous track')

				// Clean up current audio
				if (this.currentAudio) {
					this.currentAudio.pause()
					this.currentAudio.removeEventListener('ended', () => {})
					this.currentAudio.removeEventListener('timeupdate', () => {})
					this.currentAudio = null
					this.currentSource = null
				}

				// Clean up next audio if exists
				if (this.nextAudio) {
					this.nextAudio = null
					this.nextSource = null
				}

				this.currentPlayingPointer -= 1
				await this.startPlay()
			} else {
				// Restart current track if at the beginning of queue
				if (this.currentAudio) {
					this.currentAudio.currentTime = 0
					await this.currentAudio.play()
				}
			}
		} else {
			// Restart current track from beginning
			if (this.currentAudio) {
				this.currentAudio.currentTime = 0
				await this.currentAudio.play()
			}
		}
	}

	/**
	 * Subscribe to queue changes.
	 * @param listener Callback function that will be called when queue changes.
	 * @returns Destroy function to remove the listener.
	 */
	onQueueChange = (listener: QueueChangeListener): { destroy: () => void } => {
		this.queueChangeListeners.add(listener)
		return {
			destroy: () => {
				this.queueChangeListeners.delete(listener)
			},
		}
	}

	/**
	 * Notify all queue listeners about queue changes.
	 */
	private notifyQueueChange = () => {
		const queueCopy = structuredClone(this.queue)
		this.queueChangeListeners.forEach((listener) => {
			listener(queueCopy)
		})
	}

	private async startPlay() {
		// fetch the first item inside the queue
		log.player(this.queue[this.currentPlayingPointer])

		// Resume AudioContext if it's suspended (due to browser autoplay policy)
		if (this.context.state === 'suspended') {
			await this.context.resume()
			log.player('AudioContext resumed')
		}

		// If current audio exists and is paused, resume it
		if (this.currentAudio?.paused) {
			await this.currentAudio.play()
			log.player('Resumed playback')

			// Also check if we need to schedule next track
			if (!this.nextAudio && this.currentAudio) {
				const timeRemaining = this.currentAudio.duration - this.currentAudio.currentTime
				const halfwayPoint = this.currentAudio.duration / 2

				// Schedule next if conditions are met
				if (timeRemaining < 20 || this.currentAudio.currentTime > halfwayPoint) {
					this.scheduleNext()
				}
			}
			return
		}

		// Create new audio if it doesn't exist
		if (!this.currentAudio) {
			this.currentAudio = new Audio(this.queue[this.currentPlayingPointer].url)
			this.currentAudio.crossOrigin = 'true'
			this.currentSource = this.context.createMediaElementSource(this.currentAudio)
			this.currentSource.connect(this.context.destination)

			// Add event listener for when the current track ends
			this.currentAudio.addEventListener('ended', () => {
				log.player('Current track ended, switching to next')
				this.playNext()
			})

			// Add event listener for timeupdate to schedule next track at the right time
			this.currentAudio.addEventListener('timeupdate', () => {
				// Schedule next track when current track is 20 seconds from ending (or 50% complete for short tracks)
				if (this.currentAudio && !this.nextAudio) {
					const timeRemaining = this.currentAudio.duration - this.currentAudio.currentTime
					const halfwayPoint = this.currentAudio.duration / 2

					// Preload when: 20 seconds remaining OR halfway through (whichever comes first)
					if (timeRemaining < 20 || this.currentAudio.currentTime > halfwayPoint) {
						this.scheduleNext()
					}
				}
			})
		}

		// Handle play() promise with proper error catching
		try {
			await this.currentAudio.play()
			log.player('Audio playback started successfully')
		} catch (error) {
			log.player('Audio playback failed:', error)

			// Common fixes for autoplay issues
			if (error instanceof DOMException) {
				if (error.name === 'NotAllowedError') {
					// Browser autoplay policy blocked the playback
					log.player('Autoplay blocked by browser policy. User interaction required.')
					// Reset playing state since we couldn't actually play
					this.isPlaying = false
					this.playStateListeners.forEach((listener) => {
						listener(false)
					})
				} else if (error.name === 'NotSupportedError') {
					log.player('Audio format not supported')
				}
			}
			throw error // Re-throw to let caller handle it
		}
	}

	private async pausePlay() {
		this.currentAudio?.pause()
		// Also pause the next audio if it's preloaded
		if (this.nextAudio) {
			this.nextAudio.pause()
		}
	}

	private reportMetadata() {
		navigator.mediaSession.metadata = new MediaMetadata(this.queue[this.currentPlayingPointer].metadata)
		navigator.mediaSession.setActionHandler('nexttrack', this.skipToNext)
		navigator.mediaSession.setActionHandler('previoustrack', this.skipToPrevious)
		navigator.mediaSession.setActionHandler('play', async () => {
			await this.togglePlaying(true)
		})
		navigator.mediaSession.setActionHandler('pause', async () => {
			await this.togglePlaying(false)
		})
		navigator.mediaSession.setActionHandler('stop', async () => {
			await this.togglePlaying(false)
		})
	}

	private async playNext() {
		// Check if there's a next track ready
		if (!this.nextAudio) {
			// If no next track is preloaded, check if there's one in the queue
			if (this.currentPlayingPointer + 1 < this.queue.length) {
				// Create next audio on the fly if not preloaded
				this.currentPlayingPointer++
				await this.startPlay()
			} else {
				// No more tracks, stop playback
				log.player('No more tracks in queue')
				this.togglePlaying(false)
			}
			return
		}

		// Pre-play the next track to ensure it's ready
		// Set volume to 0 first to avoid any sound leak
		this.nextAudio.volume = 0

		// Start playing the next track silently to ensure it's buffered and ready
		try {
			await this.nextAudio.play()
			this.nextAudio.pause()
			this.nextAudio.currentTime = 0
			this.nextAudio.volume = 1
		} catch (error) {
			log.player('Failed to pre-buffer next track:', error)
		}

		// Clean up current audio listeners before switching
		if (this.currentAudio) {
			// Remove all event listeners
			const oldAudio = this.currentAudio
			oldAudio.removeEventListener('ended', () => {})
			oldAudio.removeEventListener('timeupdate', () => {})

			// Stop the current audio immediately
			oldAudio.pause()
		}

		// Switch to next track immediately
		this.currentAudio = this.nextAudio
		this.currentSource = this.nextSource
		this.currentPlayingPointer++

		// Clear next track references
		this.nextAudio = null
		this.nextSource = null

		// Add event listeners to the new current track
		this.currentAudio.addEventListener('ended', () => {
			log.player('Current track ended, switching to next')
			this.playNext()
		})

		this.currentAudio.addEventListener('timeupdate', () => {
			// Schedule next track when current track is 20 seconds from ending (or 50% complete for short tracks)
			if (this.currentAudio && !this.nextAudio) {
				const timeRemaining = this.currentAudio.duration - this.currentAudio.currentTime
				const halfwayPoint = this.currentAudio.duration / 2

				// Preload when: 20 seconds remaining OR halfway through (whichever comes first)
				if (timeRemaining < 20 || this.currentAudio.currentTime > halfwayPoint) {
					this.scheduleNext()
				}
			}
		})

		// Start playing the new current track immediately
		try {
			// Reset to beginning and play
			this.currentAudio.currentTime = 0
			this.currentAudio.volume = 1
			await this.currentAudio.play()
			log.player(`Playing next track: ${this.queue[this.currentPlayingPointer]?.metadata?.title || 'Unknown'}`)

			// Update metadata
			this.reportMetadata()

			// Notify queue change listeners if needed
			this.notifyQueueChange()
		} catch (error) {
			log.player('Failed to play next track:', error)
			// Try to play the next track if available
			if (this.currentPlayingPointer + 1 < this.queue.length) {
				this.currentPlayingPointer++
				await this.startPlay()
			}
		}
	}

	private scheduleNext() {
		// Check if there's already a next track scheduled
		if (this.nextAudio !== null) {
			log.player('Next track already scheduled, skipping')
			return
		}

		// Check if there's a next track in the queue
		const nextPointer = this.currentPlayingPointer + 1
		if (!this.queue[nextPointer]) {
			log.player('No next track in queue, skip schedule')
			return
		}

		log.player(`Scheduling next track: ${this.queue[nextPointer]?.metadata?.title || 'Unknown'}`)

		// Create and preload the next audio element
		this.nextAudio = new Audio(this.queue[nextPointer].url)
		this.nextAudio.crossOrigin = 'true'
		this.nextAudio.preload = 'auto' // Preload the entire audio

		// Create the audio source node for the next track
		this.nextSource = this.context.createMediaElementSource(this.nextAudio)
		this.nextSource.connect(this.context.destination)

		// Start loading the next track
		this.nextAudio.load()

		// Pre-buffer the track by playing it silently
		this.nextAudio.addEventListener(
			'canplaythrough',
			async () => {
				if (this.nextAudio && this.nextAudio.paused) {
					try {
						// Play silently to ensure the track is fully buffered
						this.nextAudio.volume = 0
						await this.nextAudio.play()
						this.nextAudio.pause()
						this.nextAudio.currentTime = 0
						this.nextAudio.volume = 1
						log.player('Next track pre-buffered successfully')
					} catch (error) {
						log.player('Failed to pre-buffer next track:', error)
					}
				}
			},
			{ once: true },
		)

		log.player('Next track scheduled and preloading')
	}
}

export { Player }
