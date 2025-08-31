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
	/** Set of listeners for shuffle state changes */
	private shuffleListeners: Set<ShuffleChangeListener>
	/** Set of listeners for loop mode changes */
	private loopListeners: Set<LoopChangeListener>
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
	/** Store the order of the actual play queue */
	private order: number[]
	/** Shuffle flag */
	private shuffle: boolean
	/** Loop flag */
	private loop: 'off' | 'entire_queue' | 'single_track'

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
		this.shuffleListeners = new Set()
		this.loopListeners = new Set()
		this.context = new AudioContext()
		this.currentSource = null
		this.currentAudio = null
		this.nextSource = null
		this.nextAudio = null
		this.currentPlayingPointer = 0
		this.order = []
		this.shuffle = false
		this.loop = 'off'
	}

	/**
	 * Replaces the entire play queue with a new queue.
	 * @param {QueueItem[]} queue - The new play queue array
	 * @fires QueueChangeListener
	 */
	replaceQueue = (queue: QueueItem[]) => {
		this.queue = queue

		// reset shuffle and loop mode
		this.shuffle = false
		this.loop = 'off'

		// remove the audio, to prevent some edge cases
		this.currentAudio = null

		const newOrder = []
		for (const i in queue) newOrder.push(parseInt(i, 10))
		this.order = newOrder

		this.notifyQueueChange()
	}

	/**
	 * Fetches the current play queue.
	 * @returns {QueueItem[]} A deep copy of the current play queue in the actual play order
	 */
	fetchQueue = (): QueueItem[] => {
		// If order array is empty, initialize it
		if (this.order.length === 0) {
			this.restoreOriginalOrder()
		}

		// Return the queue in the actual play order
		const orderedQueue: QueueItem[] = []
		for (const index of this.order) {
			if (this.queue[index]) {
				orderedQueue.push(this.queue[index])
			}
		}

		return structuredClone(orderedQueue)
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
	 * Subscribes to shuffle state changes.
	 * @param {ShuffleChangeListener} listener - Callback function that will be called when shuffle state changes
	 * @returns {{destroy: () => void}} An object with a destroy method to unsubscribe the listener
	 */
	onShuffleChange = (listener: ShuffleChangeListener): { destroy: () => void } => {
		this.shuffleListeners.add(listener)

		// Immediately call the listener with the current state
		listener(this.shuffle)

		return {
			destroy: () => {
				this.shuffleListeners.delete(listener)
			},
		}
	}

	/**
	 * Subscribes to loop mode changes.
	 * @param {LoopChangeListener} listener - Callback function that will be called when loop mode changes
	 * @returns {{destroy: () => void}} An object with a destroy method to unsubscribe the listener
	 */
	onLoopChange = (listener: LoopChangeListener): { destroy: () => void } => {
		this.loopListeners.add(listener)

		// Immediately call the listener with the current state
		listener(this.loop)

		return {
			destroy: () => {
				this.loopListeners.delete(listener)
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
	 * Toggles the shuffle state or sets it to a specific value.
	 * @param {boolean} shuffle - Optional specific shuffle state. If not provided, toggles current state
	 * @fires ShuffleChangeListener
	 * @fires QueueChangeListener
	 */
	toggleShuffle = (shuffle?: boolean) => {
		const newState = shuffle !== undefined ? shuffle : !this.shuffle
		if (this.shuffle === newState) return

		this.shuffle = newState
		log.player(`Shuffle state changed to: ${newState}`)

		// Apply or remove shuffle based on the new state
		if (newState) {
			this.shuffleQueue()
		} else {
			this.restoreOriginalOrder()
		}

		// Notify all shuffle listeners
		this.shuffleListeners.forEach((listener) => {
			listener(newState)
		})

		// Notify queue listeners about the new order
		this.notifyQueueChange()
	}

	/**
	 * Gets the current shuffle state.
	 * @returns {boolean} Current shuffle state (true if enabled, false if disabled)
	 */
	getShuffleState = (): boolean => {
		return this.shuffle
	}

	/**
	 * Gets the current loop mode.
	 * @returns {'off' | 'entire_queue' | 'single_track'} Current loop mode
	 */
	getLoopMode = (): 'off' | 'entire_queue' | 'single_track' => {
		return this.loop
	}

	/**
	 * Gets the current playing state.
	 * @returns {boolean} Current playing state (true if playing, false if paused/stopped)
	 */
	getPlayingState = (): boolean => {
		return this.isPlaying
	}

	/**
	 * Seeks to a specific position in the current track.
	 * @param {number} time - The position to seek to in seconds
	 * @returns {boolean} Success status - true if seek was successful, false otherwise
	 */
	seekTo = (time: number): boolean => {
		if (!this.currentAudio) {
			log.player('No audio element to seek')
			return false
		}

		const duration = this.currentAudio.duration

		// Check if duration is valid
		if (Number.isNaN(duration) || duration <= 0) {
			log.player('Invalid audio duration, cannot seek')
			return false
		}

		// Clamp the seek time to valid range [0, duration]
		const clampedTime = Math.max(0, Math.min(time, duration))

		log.player(`Seeking to ${clampedTime} seconds (duration: ${duration})`)

		try {
			this.currentAudio.currentTime = clampedTime

			// Immediately notify progress listeners about the seek
			if (this.progressListeners.size > 0) {
				const percentage = (clampedTime / duration) * 100
				const progress: PlaybackProgress = {
					currentTime: clampedTime,
					duration,
					percentage,
				}

				this.progressListeners.forEach((listener) => {
					listener(progress)
				})
			}

			// Check if we need to schedule/cancel next track based on new position
			this.updateNextTrackSchedule()

			return true
		} catch (error) {
			log.player('Error during seek:', error)
			return false
		}
	}

	/**
	 * Seeks by a percentage of the total duration.
	 * @param {number} percentage - The percentage to seek to (0-100)
	 * @returns {boolean} Success status - true if seek was successful, false otherwise
	 */
	seekToPercentage = (percentage: number): boolean => {
		if (!this.currentAudio) {
			log.player('No audio element to seek')
			return false
		}

		const duration = this.currentAudio.duration

		// Check if duration is valid
		if (Number.isNaN(duration) || duration <= 0) {
			log.player('Invalid audio duration, cannot seek')
			return false
		}

		// Clamp percentage to valid range [0, 100]
		const clampedPercentage = Math.max(0, Math.min(percentage, 100))
		const targetTime = (clampedPercentage / 100) * duration

		return this.seekTo(targetTime)
	}

	/**
	 * Seeks forward or backward by a specified number of seconds.
	 * @param {number} seconds - Number of seconds to seek (negative for backward, positive for forward)
	 * @returns {boolean} Success status - true if seek was successful, false otherwise
	 */
	seekRelative = (seconds: number): boolean => {
		if (!this.currentAudio) {
			log.player('No audio element to seek')
			return false
		}

		const currentTime = this.currentAudio.currentTime
		const targetTime = currentTime + seconds

		return this.seekTo(targetTime)
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
	 * Toggle loop mode
	 * @param {'off' | 'entire_queue' | 'single_track'} mode - Specific the loop mode. Will loop with "off", "entire_queue" and "single_track"
	 * sequence when not specific.
	 */
	toggleLoop = (mode?: 'off' | 'entire_queue' | 'single_track') => {
		let newMode = this.loop
		if (mode) newMode = mode
		else
			switch (this.loop) {
				case 'off':
					newMode = 'entire_queue'
					break
				case 'entire_queue':
					newMode = 'single_track'
					break
				case 'single_track':
					newMode = 'off'
					break
			}

		if (newMode === this.loop) return // no change
		this.loop = newMode
		log.player(`Loop mode changed to: ${newMode}`)

		// Notify all loop listeners
		this.loopListeners.forEach((listener) => {
			listener(newMode)
		})
	}

	/**
	 * Append new queue item
	 * @param {QueueItem} track - The new track item appended
	 */
	appendTrack = (track: QueueItem) => {
		this.queue.push(track)
		this.order.push(this.order.length) // even in shuffle mode, append to the end of the queue

		this.notifyQueueChange()
	}

	/**
	 * Notifies all queue listeners about queue changes.
	 * Sends a deep copy of the queue in the actual play order.
	 * @private
	 */
	private notifyQueueChange = () => {
		// Get the queue in the current play order
		const orderedQueue = this.fetchQueue()

		this.queueChangeListeners.forEach((listener) => {
			listener(orderedQueue)
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
		// fetch the current item from the queue based on order
		const currentTrack = this.getCurrentTrack()
		log.player(currentTrack)

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
		if (!this.currentAudio && currentTrack) {
			this.currentAudio = new Audio(currentTrack.url)
			this.currentAudio.crossOrigin = 'true'
			this.currentSource = this.context.createMediaElementSource(this.currentAudio)
			this.currentSource.connect(this.context.destination)

			// Add event listener for when the current track ends
			this.currentAudio.addEventListener('ended', () => {
				log.player('Current track ended')
				this.handleTrackEnd()
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
			await this.currentAudio?.play()
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
		const currentTrack = this.getCurrentTrack()
		if (currentTrack?.metadata) {
			navigator.mediaSession.metadata = new MediaMetadata(currentTrack.metadata)
		}
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
		if (currentTrack) {
			for (const listener of this.currentPlayingChangeListeners) {
				listener(currentTrack)
			}
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
			// If no next track is preloaded, check if there's one in the queue or we should loop
			if (this.currentPlayingPointer + 1 < this.queue.length) {
				// Create next audio on the fly if not preloaded
				this.currentPlayingPointer++
				await this.startPlay()
			} else if (this.loop === 'entire_queue' && this.queue.length > 0) {
				// Loop back to first track
				this.currentPlayingPointer = 0
				await this.startPlay()
			} else {
				// No more tracks and not looping, stop playback
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

		// Update pointer based on loop mode
		if (this.currentPlayingPointer + 1 >= this.queue.length && this.loop === 'entire_queue') {
			// Loop back to first track
			this.currentPlayingPointer = 0
		} else {
			this.currentPlayingPointer++
		}

		// Clear next track references
		this.nextAudio = null
		this.nextSource = null

		// Add event listeners to the new current track
		this.currentAudio.addEventListener('ended', () => {
			log.player('Current track ended')
			this.handleTrackEnd()
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
			const nextTrack = this.getCurrentTrack()
			log.player(`Playing next track: ${nextTrack?.metadata?.title || 'Unknown'}`)

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

		// Don't schedule next if single track loop is active
		if (this.loop === 'single_track') {
			log.player('Single track loop active, not scheduling next')
			return
		}

		// Determine the next track based on loop mode
		let nextPointer = this.currentPlayingPointer + 1
		let actualNextIndex: number
		let nextTrack: QueueItem | undefined

		if (nextPointer >= this.queue.length) {
			// At the end of queue
			if (this.loop === 'entire_queue' && this.queue.length > 0) {
				// Loop back to first track
				nextPointer = 0
				actualNextIndex = this.getActualQueueIndex(nextPointer)
				nextTrack = this.queue[actualNextIndex]
			} else {
				// No loop, no next track
				log.player('No next track to schedule (end of queue)')
				return
			}
		} else {
			// Normal next track
			actualNextIndex = this.getActualQueueIndex(nextPointer)
			nextTrack = this.queue[actualNextIndex]
		}

		if (!nextTrack) {
			log.player('Next track not found')
			return
		}

		log.player(`Scheduling next track: ${nextTrack?.metadata?.title || 'Unknown'}`)

		// Create and preload the next audio element
		this.nextAudio = new Audio(nextTrack.url)
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
				if (this.nextAudio?.paused) {
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

				if (!Number.isNaN(duration) && duration > 0) {
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

		// Get the actual track from the queue
		const track = this.getCurrentTrack()
		if (!track) {
			log.player('Track not found at index:', trackIndex)
			return
		}

		// Create new audio element but don't play
		this.currentAudio = new Audio(track.url)
		this.currentAudio.crossOrigin = 'true'
		this.currentSource = this.context.createMediaElementSource(this.currentAudio)
		this.currentSource.connect(this.context.destination)

		// Set up event listeners
		this.currentAudio.addEventListener('ended', () => {
			log.player('Current track ended')
			this.handleTrackEnd()
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

		log.player(`Switched to track: ${track?.metadata?.title || 'Unknown'}`)
	}

	/**
	 * Gets the actual queue index based on the current order.
	 * @private
	 * @param {number} orderIndex - The index in the order array
	 * @returns {number} The actual index in the queue array
	 */
	private getActualQueueIndex(orderIndex: number): number {
		// If order array is empty, initialize it
		if (this.order.length === 0) {
			this.restoreOriginalOrder()
		}

		// Return the actual queue index from the order array
		return this.order[orderIndex] ?? orderIndex
	}

	/**
	 * Gets the current playing track from the queue.
	 * @private
	 * @returns {QueueItem | undefined} The current playing track
	 */
	private getCurrentTrack(): QueueItem | undefined {
		const actualIndex = this.getActualQueueIndex(this.currentPlayingPointer)
		return this.queue[actualIndex]
	}

	/**
	 * Shuffle the queue using Fisher-Yates algorithm.
	 * Keeps the current and previous items in place if currently playing.
	 * @private
	 */
	private shuffleQueue() {
		// if currently playing or current pointer is not in the first item,
		// the algorithm will keep the current and previous items as is.
		const shouldKeepPrevious =
			this.isPlaying || this.currentPlayingPointer > 0 || (!!this.currentAudio && this.currentAudio.currentTime !== 0)

		const startShuffleFrom = shouldKeepPrevious ? this.currentPlayingPointer + 1 : 0

		const keepRemainRange: number[] = []
		const shuffleRange: number[] = []
		for (const i in this.queue) {
			if (parseInt(i, 10) < startShuffleFrom) keepRemainRange.push(parseInt(i, 10))
			else shuffleRange.push(parseInt(i, 10))
		}

		// Shuffle the shuffleRange using Fisher-Yates algorithm
		for (let i = shuffleRange.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1))
			;[shuffleRange[i], shuffleRange[j]] = [shuffleRange[j], shuffleRange[i]]
		}

		// Combine the kept items with the shuffled items
		this.order = [...keepRemainRange, ...shuffleRange]

		log.player('Queue shuffled. New order:', this.order)
	}

	/**
	 * Restore the queue to its original order.
	 * @private
	 */
	private restoreOriginalOrder() {
		// preserve current playing item
		const currentPlaying = this.order[this.currentPlayingPointer]

		this.order = []
		for (const i in this.queue) {
			this.order.push(parseInt(i, 10))
		}

		// Only adjust currentPlayingPointer if there's active playback
		// Don't adjust if: no audio exists, or audio exists but hasn't started playing
		const hasActivePlayback = this.currentAudio && (this.currentAudio.currentTime > 0 || !this.currentAudio.paused)

		if (hasActivePlayback) {
			// Find the new position of the currently playing track in the restored order
			this.currentPlayingPointer = this.order.indexOf(currentPlaying)
			if (this.currentPlayingPointer === -1) {
				// Fallback to 0 if current track not found (shouldn't happen)
				this.currentPlayingPointer = 0
			}
		}
		// Otherwise keep currentPlayingPointer as is (typically 0 for no playback)

		log.player('Queue restored to original order')
	}

	/**
	 * Handles the end of a track based on the current loop mode.
	 * @private
	 */
	private handleTrackEnd() {
		if (this.loop === 'single_track') {
			// Single track loop - replay the same track
			log.player('Looping single track')
			if (this.currentAudio) {
				this.currentAudio.currentTime = 0
				this.currentAudio.play()
			}
		} else if (this.currentPlayingPointer + 1 >= this.queue.length) {
			// End of queue reached
			if (this.loop === 'entire_queue') {
				// Loop entire queue - go back to the first track
				log.player('Looping entire queue')
				this.currentPlayingPointer = -1 // Will be incremented to 0 in playNext
				this.playNext()
			} else {
				// No loop - stop playback
				log.player('End of queue, stopping playback')
				this.togglePlaying(false)
			}
		} else {
			// Normal next track
			this.playNext()
		}
	}

	/**
	 * Updates the next track scheduling based on current playback position.
	 * Called after seeking to determine if we need to schedule or cancel the next track.
	 * @private
	 */
	private updateNextTrackSchedule() {
		if (!this.currentAudio) return

		const currentTime = this.currentAudio.currentTime
		const duration = this.currentAudio.duration

		if (Number.isNaN(duration) || duration <= 0) return

		const timeRemaining = duration - currentTime
		const halfwayPoint = duration / 2

		// Check if we should schedule the next track
		const shouldScheduleNext = timeRemaining < 20 || currentTime > halfwayPoint

		if (shouldScheduleNext && !this.nextAudio) {
			// We should have next track scheduled but don't - schedule it now
			log.player('Scheduling next track after seek')
			this.scheduleNext()
		} else if (!shouldScheduleNext && this.nextAudio) {
			// We have next track scheduled but shouldn't - cancel it
			log.player('Canceling next track schedule after seek')
			this.nextAudio = null
			this.nextSource = null
		}
	}
}

export { Player }
