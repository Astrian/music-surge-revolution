declare global {
	/**
	 * An object represent a track inside the queue.
	 */
	interface QueueItem {
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
}

export {}
