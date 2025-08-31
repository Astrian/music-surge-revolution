// 导出全局类型定义，确保它们被包含在构建中
export interface QueueItem {
	/** The URL of the audio track. */
	url: string

	/** Optional metadata information about the track.
	 * Generally used for browser `media.session` reporting and
	 * operating system control.
	 */
	metadata?: {
		title?: string
		artist?: string
		album?: string
		artwork?: {
			src: string
			sizes?: string
			type?: 'image/jpeg' | 'image/png'
		}[]
	}
}

/**
 * Progress state object containing current playback position and duration.
 */
export interface PlaybackProgress {
	/** Current playback position in seconds */
	currentTime: number
	/** Total duration of the track in seconds */
	duration: number
	/** Progress as a percentage (0-100) */
	percentage: number
}

/**
 * Listener function type for play state changes.
 */
export type PlayStateChangeListener = (isPlaying: boolean) => void

/**
 * Listener function type for queue changes.
 */
export type QueueChangeListener = (queue: QueueItem[]) => void

/**
 * Listener function type for current track changes.
 */
export type CurrentPlayingChangeListener = (track: QueueItem) => void

/**
 * Listener function type for playback progress changes.
 */
export type PlaybackProgressListener = (progress: PlaybackProgress) => void

/**
 * Listener function type for shuffle state changes.
 */
export type ShuffleChangeListener = (shuffleEnabled: boolean) => void

/**
 * Listener function type for loop mode changes.
 */
export type LoopChangeListener = (loopMode: 'off' | 'entire_queue' | 'single_track') => void
