import log from './debug'

/**
 * Music player class that handles audio playback with queue management and seamless transitions.
 * @class Player
 */
class Player {
	/** The queue of items to be played */
	private queue: QueueItem[]
	/** Current playing state */
	private isPlaying: boolean
	/** Set of listeners for play state changes */
	private playStateListeners: Set<PlayStateChangeListener>
	/** Set of listeners for queue changes */
	private queueChangeListeners: Set<QueueChangeListener>
	/** Set of listeners of playing track changes */
	private currentPlayingChangeListeners: Set<CurrentPlayingChangeListener>
	/** Set of listeners for playback progress changes */
	private progressListeners: Set<PlaybackProgressListener>
	/** Timer for progress updates */
	private progressTimer: number | null
	/** Web Audio API context for audio processing */
	private context: AudioContext
	/** Audio source node for the current track */
	private currentSource: MediaElementAudioSourceNode | null
	/** HTML audio element for the current track */
	private currentAudio: HTMLAudioElement | null
	/** Audio source node for the next track (preloaded) */
	private nextSource: MediaElementAudioSourceNode | null
	/** HTML audio element for the next track (preloaded) */
	private nextAudio: HTMLAudioElement | null
	/** Index of the currently playing item in the queue */
	private currentPlayingPointer: number

	/**
	 * Creates a new player instance.
	 * Initializes the AudioContext and sets up the initial state.
	 * @constructor
	 */
	constructor() {
		this.queue = []
		this.isPlaying = false
		this.playStateListeners = new Set()
		this.queueChangeListeners = new Set()
		this.currentPlayingChangeListeners = new Set()
		this.progressListeners = new Set()
		this.progressTimer = null
		this.context = new AudioContext()
		this.currentSource = null
		this.currentAudio = null
		this.nextSource = null
		this.nextAudio = null
		this.currentPlayingPointer = 0
	}

	/**
	 * Replaces the entire play queue with a new queue.
	 * @param {QueueItem[]} queue - The new play queue array
	 * @fires QueueChangeListener
	 */
	replaceQueue = (queue: QueueItem[]) => {
		this.queue = queue
		this.notifyQueueChange()
	}

	/**
	 * Fetches the current play queue.
	 * @returns {QueueItem[]} A deep copy of the current play queue to prevent external modification
	 */
	fetchQueue = (): QueueItem[] => {
		return structuredClone(this.queue)
	}

	/**
	 * Subscribes to play state changes.
	 * @param {PlayStateChangeListener} listener - Callback function that will be called when play state changes
	 * @returns {{destroy: () => void}} An object with a destroy method to unsubscribe the listener
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
	 * Subscribes to current playing track changes.
	 * @param {CurrentPlayingChangeListener} listener - Callback function that will be called when current playing track changes
	 * @returns {{destroy: () => void}} An object with a destroy method to unsubscribe the listener
	 */
	onCurrentPlayingChange = (listener: CurrentPlayingChangeListener): { destroy: () => void } => {
		this.currentPlayingChangeListeners.add(listener)
		return {
			destroy: () => {
				this.currentPlayingChangeListeners.delete(listener)
			},
		}
	}

	/**
	 * Subscribes to playback progress changes.
	 * @param {PlaybackProgressListener} listener - Callback function that will be called when playback progress changes
	 * @returns {{destroy: () => void}} An object with a destroy method to unsubscribe the listener
	 */
	onProgressChange = (listener: PlaybackProgressListener): { destroy: () => void } => {
		this.progressListeners.add(listener)

		// Start progress updates if this is the first listener and audio is playing
		if (this.progressListeners.size === 1 && this.isPlaying && this.currentAudio) {
			this.startProgressUpdates()
		}

		return {
			destroy: () => {
				this.progressListeners.delete(listener)

				// Stop progress updates if no more listeners
				if (this.progressListeners.size === 0) {
					this.stopProgressUpdates()
				}
			},
		}
	}

	/**
	 * Toggles the playing state or sets it to a specific value.
	 * @param {boolean} [playing] - Optional specific playing state. If not provided, toggles current state
	 * @returns {Promise<void>}
	 * @fires PlayStateChangeListener
	 */
	togglePlaying = async (playing?: boolean) => {
		const newState = playing !== undefined ? playing : !this.isPlaying
		if (this.isPlaying === newState) return
		this.isPlaying = newState
		log.player(`Play state changed to: ${newState}`)

		// Start or stop progress updates based on playing state and listeners
		if (newState && this.progressListeners.size > 0) {
			this.startProgressUpdates()
		} else {
			this.stopProgressUpdates()
		}

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
	 * Gets the current playing state.
	 * @returns {boolean} Current playing state (true if playing, false if paused/stopped)
	 */
	getPlayingState = (): boolean => {
		return this.isPlaying
	}

	/**
	 * Skips to the next track in the queue.
	 * Respects the current play state - only auto-plays if currently playing.
	 * @returns {Promise<void>}
	 */
	skipToNext = async () => {
		if (this.currentPlayingPointer + 1 < this.queue.length) {
			log.player('Skipping to next track')

			const wasPlaying = this.isPlaying
			const nextTrackIndex = this.currentPlayingPointer + 1

			// Switch to the next track without auto-playing
			await this.switchToTrack(nextTrackIndex)

			// If music was playing before, resume playback
			if (wasPlaying) {
				await this.startPlay()
			}
		} else {
			log.player('No next track available')
		}
	}

	/**
	 * Skips to the previous track or restarts the current track.
	 * If current track has played < 5 seconds, goes to previous track.
	 * Otherwise, restarts the current track from the beginning.
	 * Respects the current play state - only auto-plays if currently playing.
	 * @returns {Promise<void>}
	 */
	skipToPrevious = async () => {
		const wasPlaying = this.isPlaying

		// If current track has played less than 5 seconds, go to previous track
		// Otherwise, restart the current track
		if ((this.currentAudio?.currentTime ?? 0) < 5 && this.currentPlayingPointer > 0) {
			log.player('current play progress is less than 5 secs')
			log.player('Skipping to previous track')

			const prevTrackIndex = this.currentPlayingPointer - 1

			// Switch to the previous track without auto-playing
			await this.switchToTrack(prevTrackIndex)

			// If music was playing before, resume playback
			if (wasPlaying) {
				await this.startPlay()
			}
		} else {
			// Restart current track from beginning
			if (this.currentAudio) {
				this.currentAudio.currentTime = 0

				// Trigger progress change notification for the reset
				if (this.progressListeners.size > 0) {
					const progress: PlaybackProgress = {
						currentTime: 0,
						duration: this.currentAudio.duration || 0,
						percentage: 0,
					}

					this.progressListeners.forEach((listener) => {
						listener(progress)
					})
				}

				// Only resume playing if it was playing before
				if (wasPlaying && this.currentAudio.paused) {
					await this.currentAudio.play()
				}
			}
		}
	}

	/**
	 * Subscribes to queue changes.
	 * @param {QueueChangeListener} listener - Callback function that will be called when queue changes
	 * @returns {{destroy: () => void}} An object with a destroy method to unsubscribe the listener
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
	 * Notifies all queue listeners about queue changes.
	 * Sends a deep copy of the queue to prevent external modifications.
	 * @private
	 */
	private notifyQueueChange = () => {
		const queueCopy = structuredClone(this.queue)
		this.queueChangeListeners.forEach((listener) => {
			listener(queueCopy)
		})
	}

	/**
	 * Starts or resumes playback of the current track.
	 * Handles AudioContext resumption, audio creation, and event listener setup.
	 * @private
	 * @returns {Promise<void>}
	 * @throws {DOMException} When autoplay is blocked or audio format is unsupported
	 */
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

	/**
	 * Pauses the current playback.
	 * Also pauses any preloaded next track.
	 * @private
	 * @returns {Promise<void>}
	 */
	private async pausePlay() {
		this.currentAudio?.pause()
		// Also pause the next audio if it's preloaded
		if (this.nextAudio) {
			this.nextAudio.pause()
		}
	}

	/**
	 * Reports media metadata to the browser's MediaSession API.
	 * Sets up media control handlers for play/pause/next/previous.
	 * @private
	 */
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
		// Report to current playing listeners
		for (const listener of this.currentPlayingChangeListeners) {
			listener(this.queue[this.currentPlayingPointer])
		}
	}

	/**
	 * Plays the next track in the queue.
	 * Handles seamless transition from current to next track.
	 * If next track is not preloaded, creates it on the fly.
	 * @private
	 * @returns {Promise<void>}
	 */
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

	/**
	 * Schedules and preloads the next track for seamless playback.
	 * Creates audio element, connects to AudioContext, and pre-buffers the audio.
	 * @private
	 */
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

	/**
	 * Starts periodic progress updates for progress listeners.
	 * Updates are sent approximately every 100ms while audio is playing.
	 * @private
	 */
	private startProgressUpdates() {
		if (this.progressTimer !== null) {
			this.stopProgressUpdates()
		}

		this.progressTimer = window.setInterval(() => {
			if (this.currentAudio && this.progressListeners.size > 0) {
				const currentTime = this.currentAudio.currentTime
				const duration = this.currentAudio.duration

				if (!isNaN(duration) && duration > 0) {
					const percentage = (currentTime / duration) * 100

					const progress: PlaybackProgress = {
						currentTime,
						duration,
						percentage,
					}

					this.progressListeners.forEach((listener) => {
						listener(progress)
					})
				}
			} else {
				// Stop timer if no audio or no listeners
				this.stopProgressUpdates()
			}
		}, 100) // Update every 100ms
	}

	/**
	 * Stops periodic progress updates.
	 * @private
	 */
	private stopProgressUpdates() {
		if (this.progressTimer !== null) {
			window.clearInterval(this.progressTimer)
			this.progressTimer = null
		}
	}

	/**
	 * Switches to a specific track without auto-playing.
	 * Prepares the audio element and resets progress to 0.
	 * @private
	 * @param {number} trackIndex - The index of the track to switch to
	 */
	private async switchToTrack(trackIndex: number) {
		if (trackIndex < 0 || trackIndex >= this.queue.length) {
			log.player('Invalid track index:', trackIndex)
			return
		}

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

		// Update pointer
		this.currentPlayingPointer = trackIndex

		// Create new audio element but don't play
		this.currentAudio = new Audio(this.queue[trackIndex].url)
		this.currentAudio.crossOrigin = 'true'
		this.currentSource = this.context.createMediaElementSource(this.currentAudio)
		this.currentSource.connect(this.context.destination)

		// Set up event listeners
		this.currentAudio.addEventListener('ended', () => {
			log.player('Current track ended, switching to next')
			this.playNext()
		})

		this.currentAudio.addEventListener('timeupdate', () => {
			if (this.currentAudio && !this.nextAudio) {
				const timeRemaining = this.currentAudio.duration - this.currentAudio.currentTime
				const halfwayPoint = this.currentAudio.duration / 2

				if (timeRemaining < 20 || this.currentAudio.currentTime > halfwayPoint) {
					this.scheduleNext()
				}
			}
		})

		// Reset progress to 0
		this.currentAudio.currentTime = 0

		// Trigger progress change notification for the reset
		if (this.progressListeners.size > 0) {
			const progress: PlaybackProgress = {
				currentTime: 0,
				duration: this.currentAudio.duration || 0,
				percentage: 0,
			}

			this.progressListeners.forEach((listener) => {
				listener(progress)
			})
		}

		// Update metadata without starting playback
		this.reportMetadata()
		this.notifyQueueChange()

		log.player(`Switched to track: ${this.queue[trackIndex]?.metadata?.title || 'Unknown'}`)
	}
}

export { Player }
