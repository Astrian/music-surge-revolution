declare global {
	interface QueueItem {
		url: string
		metadata?: {
			title: string
			artist: string
			album: string
			artwork: string
		}
	}
}

export {}
