'use client'

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
import { GripVertical, MonitorPlay } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Unit {
  id: string
  title: string
}

function SortableUnit({
  unit,
  isActive,
  onClick,
}: {
  unit: Unit
  isActive: boolean
  onClick: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: unit.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-1 rounded-lg text-sm transition-colors',
        isDragging && 'z-10 opacity-80 shadow-md',
        isActive
          ? 'bg-brand-purple/10 font-medium text-brand-purple'
          : 'text-fg-secondary hover:bg-surface-secondary'
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab px-1 py-2 text-fg-muted hover:text-fg-primary active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" />
      </button>
      <button
        onClick={onClick}
        className="flex flex-1 items-center gap-2 py-2 pr-3 text-left"
      >
        <MonitorPlay className="size-3.5" />
        {unit.title}
      </button>
    </div>
  )
}

export function SortableUnitList({
  units,
  selectedUnitId,
  onSelectUnit,
  onReorder,
}: {
  units: Unit[]
  selectedUnitId: string | null
  onSelectUnit: (id: string) => void
  onReorder: (reordered: Unit[]) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = units.findIndex((u) => u.id === active.id)
    const newIndex = units.findIndex((u) => u.id === over.id)

    const reordered = [...units]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)
    onReorder(reordered)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={units.map((u) => u.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-0.5">
          {units.map((unit) => (
            <SortableUnit
              key={unit.id}
              unit={unit}
              isActive={unit.id === selectedUnitId}
              onClick={() => onSelectUnit(unit.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
