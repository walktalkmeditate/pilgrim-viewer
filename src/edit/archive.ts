import type { Walk, ArchivedWalk } from '../parsers/types'

export function walkToArchived(walk: Walk, archivedAtSeconds: number): ArchivedWalk {
  const archived: ArchivedWalk = {
    id: walk.id,
    startDate: Math.floor(walk.startDate.getTime() / 1000),
    endDate: Math.floor(walk.endDate.getTime() / 1000),
    archivedAt: archivedAtSeconds,
    stats: {
      distance: walk.stats.distance,
      activeDuration: walk.stats.activeDuration,
      talkDuration: walk.stats.talkDuration,
      meditateDuration: walk.stats.meditateDuration,
    },
  }
  if (walk.stats.steps !== undefined) {
    archived.stats.steps = walk.stats.steps
  }
  return archived
}
