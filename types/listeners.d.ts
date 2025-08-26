declare global {
	/**
	 * Listener function type for play state changes.
	 * @callback PlayStateChangeListener
	 * @param {boolean} isPlaying - The current playing state
	 */
	type PlayStateChangeListener = (isPlaying: boolean) => void

	/**
	 * Listener function type for queue changes.
	 * @callback QueueChangeListener
	 * @param {QueueItem[]} queue - The updated queue array
	 */
	type QueueChangeListener = (queue: QueueItem[]) => void

	/**
	 * Listener function type for current track changes.
	 * @callback CurrentPlayingChangeListener
	 * @param {QueueItem} track - Information of the track which is currently playing
	 */
	type CurrentPlayingChangeListener = (track: QueueItem) => void

	/**
	 * Progress state object containing current playback position and duration.
	 */
	interface PlaybackProgress {
		/** Current playback position in seconds */
		currentTime: number
		/** Total duration of the track in seconds */
		duration: number
		/** Progress as a percentage (0-100) */
		percentage: number
	}

	/**
	 * Listener function type for playback progress changes.
	 * @callback PlaybackProgressListener
	 * @param {PlaybackProgress} progress - Current playback progress information
	 */
	type PlaybackProgressListener = (progress: PlaybackProgress) => void
}

export {}
