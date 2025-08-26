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

		this.currentAudio = new Audio(this.queue[this.currentPlayingPointer].url)
		this.currentSource = this.context.createMediaElementSource(this.currentAudio)
		this.currentSource.connect(this.context.destination)

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
	}

	private reportMetadata() {
		navigator.mediaSession.metadata = new MediaMetadata(this.queue[this.currentPlayingPointer].metadata)
	}
}

export { Player }
