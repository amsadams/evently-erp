"use client";
import * as React from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

export interface KanbanColumn { id: string; label: string; tone?: string }

function Column({ col, count, children }: { col: KanbanColumn; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  return (
    <section ref={setNodeRef} aria-label={col.label} className={cn("flex w-72 shrink-0 flex-col rounded-xl border border-line bg-canvas/70 transition-colors", isOver && "border-primary/50 bg-primary-soft/40")}>
      <header className="flex items-center justify-between px-3 py-2.5">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><span className={cn("h-2 w-2 rounded-full", col.tone ?? "bg-muted")} />{col.label}</h3>
        <span className="rounded-full bg-surface px-2 text-xs font-medium text-muted">{count}</span>
      </header>
      <div className="flex min-h-[80px] flex-1 flex-col gap-2 px-2 pb-2">{children}</div>
    </section>
  );
}

function Card({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return <div ref={setNodeRef} {...listeners} {...attributes} className={cn("cursor-grab touch-manipulation rounded-lg border border-line bg-surface p-3 shadow-sm active:cursor-grabbing", isDragging && "opacity-40")}>{children}</div>;
}

export function KanbanBoard<T extends { id: string }>({ columns, items, columnOf, renderCard, onMove }: {
  columns: KanbanColumn[]; items: T[]; columnOf: (t: T) => string; renderCard: (t: T) => React.ReactNode; onMove: (item: T, columnId: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const active = items.find((i) => i.id === activeId);
  const end = (e: DragEndEvent) => {
    setActiveId(null);
    const item = items.find((i) => i.id === e.active.id);
    if (item && e.over && columnOf(item) !== e.over.id) onMove(item, String(e.over.id));
  };
  return (
    <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={end} onDragCancel={() => setActiveId(null)}>
      <div className="scroll-thin -mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
        {columns.map((c) => {
          const list = items.filter((i) => columnOf(i) === c.id);
          return (
            <Column key={c.id} col={c} count={list.length}>
              {list.map((i) => <Card key={i.id} id={i.id}>{renderCard(i)}</Card>)}
              {list.length === 0 && <p className="rounded-lg border border-dashed border-line px-3 py-5 text-center text-xs text-muted">Drop here</p>}
            </Column>
          );
        })}
      </div>
      <DragOverlay>{active ? <div className="rotate-1 rounded-lg border border-primary/40 bg-surface p-3 shadow-xl">{renderCard(active)}</div> : null}</DragOverlay>
    </DndContext>
  );
}
