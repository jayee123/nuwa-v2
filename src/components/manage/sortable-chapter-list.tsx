'use client'

import { type ReactNode } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface Chapter {
  id: string
  title: string
}

function SortableChapter({
  chapter,
  children,
}: {
  chapter: Chapter
  children: (props: {
    dragHandleProps: { ref: (node: HTMLElement | null) => void } & Record<string, unknown>
    isDragging: boolean
  }) => ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: chapter.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'z-10 opacity-80 shadow-md' : ''}>
      {children({
        dragHandleProps: { ref: setActivatorNodeRef, ...attributes, ...listeners },
        isDragging,
      })}
    </div>
  )
}

export function SortableChapterList({
  chapters,
  onReorder,
  children,
}: {
  chapters: Chapter[]
  onReorder: (reordered: Chapter[]) => void
  children: (
    chapter: Chapter,
    props: {
      dragHandleProps: { ref: (node: HTMLElement | null) => void } & Record<string, unknown>
      isDragging: boolean
    }
  ) => ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = chapters.findIndex((c) => c.id === active.id)
    const newIndex = chapters.findIndex((c) => c.id === over.id)

    const reordered = [...chapters]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)
    onReorder(reordered)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={chapters.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {chapters.map((chapter) => (
            <SortableChapter key={chapter.id} chapter={chapter}>
              {(props) => children(chapter, props)}
            </SortableChapter>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
