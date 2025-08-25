import log from './debug'

type PlayStateChangeListener = (isPlaying: boolean) => void
type QueueChangeListener = (queue: QueueItem[]) => void

class Player {
	private queue: QueueItem[]
	private isPlaying: boolean
	private playStateListeners: Set<PlayStateChangeListener>
	private queueChangeListeners: Set<QueueChangeListener>

	/**
	 * Create a new player instance.
	 * @constructor
	 */
	constructor() {
		this.queue = []
		this.isPlaying = false
		this.playStateListeners = new Set()
		this.queueChangeListeners = new Set()
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
	togglePlaying = (playing?: boolean) => {
		const newState = playing ? playing : !this.isPlaying
		if (this.isPlaying !== newState) {
			this.isPlaying = newState
			log.player(`Play state changed to: ${newState}`)
			this.playStateListeners.forEach((listener) => {
				listener(newState)
			})
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
}

export { Player }
