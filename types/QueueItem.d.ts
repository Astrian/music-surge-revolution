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
			/**
			 * The title of the track.
			 * @example "Bohemian Rhapsody"
			 */
			title: string

			/**
			 * The artist or performer of the track
			 * @example "Queen"
			 */
			artist: string

			/**
			 * The album name that contains this track
			 * @example "A Night at the Opera"
			 */
			album: string

			/**
			 * URL or path to the album artwork/cover image
			 * @example "https://example.com/cover.jpg"
			 */
			artwork: string
		}
	}
}

export {}
