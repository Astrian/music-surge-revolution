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
