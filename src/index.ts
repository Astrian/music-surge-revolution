import log from './debug'

class Player {
	queue: QueueItem[]

	constructor() {
		this.queue = []
	}

	replaceQueue = (queue: QueueItem[]) => {
		log.player('queue replaced')
		log.player(queue)
		this.queue = queue
	}
}

export { Player }
