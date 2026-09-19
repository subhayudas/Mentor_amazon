import { useId, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckSquare, Plus, StickyNote, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ChipRadio, ChipRadioGroup } from "@/components/discovery/FilterChip";
import { toast } from "sonner";
import type { BookingNote } from "@/lib/database";
import { formatDate } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import { bookingService } from "@/lib/services";
import { cn } from "@/lib/utils";
import { ARIA_DISABLED_CLASS } from "@/pages/mentee/shared";

/**
 * Notes and tasks attached to one booking — one implementation for the
 * mentee's "View request" dialog and the mentor's session notes dialog.
 * Reads `['bookings', id, 'notes']`; the composer is a note/task radio group
 * (FilterChips) plus a textarea; mentors may also set a due date and delete
 * their own notes. Task rows are checkboxes named by their own text.
 */
export interface BookingNotesProps {
  bookingId: string;
  authorType: "mentor" | "mentee";
  authorEmail: string;
  /** Mentor-only extras: due date on tasks and deleting own notes. */
  extended?: boolean;
}

type NoteType = "note" | "task";

export function BookingNotes({ bookingId, authorType, authorEmail, extended = false }: BookingNotesProps) {
  const { t, i18n } = useTranslation();
  const [content, setContent] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("note");
  const [dueDate, setDueDate] = useState("");
  const baseId = useId();

  const notesQuery = useQuery<BookingNote[]>({
    queryKey: ["bookings", bookingId, "notes"],
    queryFn: () => bookingService.getNotes(bookingId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["bookings", bookingId, "notes"] });

  const addNote = useMutation({
    mutationFn: () =>
      bookingService.addNote({
        booking_id: bookingId,
        content: content.trim(),
        note_type: noteType,
        author_type: authorType,
        author_email: authorEmail,
        due_date: extended && noteType === "task" && dueDate ? new Date(dueDate).toISOString() : undefined,
      }),
    onSuccess: () => {
      invalidate();
      setContent("");
      setDueDate("");
      toast.success(t("dashboardV2.notes.added"));
    },
    onError: () => toast.error(t("dashboardV2.notes.addError")),
  });

  const toggleTask = useMutation({
    mutationFn: (note: BookingNote) => bookingService.updateNote(note.id, { is_completed: !note.is_completed }),
    onSuccess: () => invalidate(),
    onError: () => toast.error(t("dashboardV2.notes.updateError")),
  });

  const deleteNote = useMutation({
    mutationFn: (noteId: string) => bookingService.deleteNote(noteId),
    onSuccess: () => invalidate(),
    onError: () => toast.error(t("dashboardV2.notes.deleteError")),
  });

  const notes = notesQuery.data ?? [];
  const canSubmit = content.trim().length > 0;

  return (
    <div className="space-y-6">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit && !addNote.isPending) addNote.mutate();
        }}
      >
        <ChipRadioGroup
          aria-label={t("dashboardV2.notes.typeLabel")}
          value={noteType}
          onValueChange={(value) => setNoteType(value === "task" ? "task" : "note")}
        >
          <ChipRadio value="note" data-testid="button-type-note">
            {t("dashboardV2.notes.typeNote")}
          </ChipRadio>
          <ChipRadio value="task" data-testid="button-type-task">
            {t("dashboardV2.notes.typeTask")}
          </ChipRadio>
        </ChipRadioGroup>
        <div className="space-y-1.5">
          <Label htmlFor={`${baseId}-content`}>
            {noteType === "note" ? t("dashboardV2.notes.noteLabel") : t("dashboardV2.notes.taskLabel")}
          </Label>
          <Textarea
            id={`${baseId}-content`}
            dir="auto"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={noteType === "note" ? t("dashboardV2.notes.notePlaceholder") : t("dashboardV2.notes.taskPlaceholder")}
            className="min-h-20"
            data-testid="input-note-content"
          />
        </div>
        {extended && noteType === "task" && (
          <div className="space-y-1.5">
            <Label htmlFor={`${baseId}-due`}>{t("dashboardV2.notes.dueDate")}</Label>
            <Input
              id={`${baseId}-due`}
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="w-auto"
              data-testid="input-note-due-date"
            />
          </div>
        )}
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            className={ARIA_DISABLED_CLASS}
            loading={addNote.isPending}
            aria-disabled={!canSubmit || undefined}
            aria-describedby={!canSubmit ? `${baseId}-hint` : undefined}
            data-testid="button-add-note"
          >
            <Plus aria-hidden="true" />
            {t("dashboardV2.notes.add")}
          </Button>
          {!canSubmit && (
            <span id={`${baseId}-hint`} className="text-caption text-muted-foreground">
              {t("dashboardV2.notes.emptyHint")}
            </span>
          )}
        </div>
      </form>

      <section aria-labelledby={`${baseId}-history`} className="space-y-3">
        <h3 id={`${baseId}-history`} className="text-body-sm font-medium text-foreground">
          {t("dashboardV2.notes.history")}
        </h3>
        {notesQuery.isLoading ? (
          <div role="status" className="space-y-2">
            <span className="sr-only">{t("common.loading")}</span>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : notesQuery.isError ? (
          <p className="text-body-sm text-destructive" role="alert">
            {t("dashboardV2.notes.loadError")}{" "}
            <button type="button" className="underline underline-offset-2" onClick={() => notesQuery.refetch()}>
              {t("common.tryAgain")}
            </button>
          </p>
        ) : notes.length === 0 ? (
          <p className="text-body-sm text-muted-foreground" data-testid="text-no-notes">
            {t("dashboardV2.notes.empty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {notes.map((note) => {
              const mine = note.author_type === authorType;
              const done = note.note_type === "task" && !!note.is_completed;
              const textId = `${baseId}-note-${note.id}`;
              return (
                <li
                  key={note.id}
                  className={cn("flex items-start gap-3 rounded-lg border border-border bg-card p-3", done && "bg-muted/40")}
                  data-testid={`note-item-${note.id}`}
                >
                  {note.note_type === "task" ? (
                    <Checkbox
                      checked={!!note.is_completed}
                      onCheckedChange={() => toggleTask.mutate(note)}
                      aria-labelledby={textId}
                      className="mt-1"
                      data-testid={`checkbox-task-${note.id}`}
                    />
                  ) : (
                    <StickyNote className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p id={textId} dir="auto" className={cn("text-body-sm text-foreground", done && "text-muted-foreground line-through")}>
                      {note.content}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-caption text-muted-foreground">
                      <span>
                        {mine
                          ? t("dashboardV2.notes.fromYou")
                          : authorType === "mentee"
                            ? t("dashboardV2.notes.fromMentor")
                            : t("dashboardV2.notes.fromMentee")}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatDate(note.created_at, i18n.language)}</span>
                      {note.note_type === "task" && note.due_date && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1">
                            <CheckSquare className="size-3.5" aria-hidden="true" />
                            {t("dashboardV2.notes.dueOn", { date: formatDate(note.due_date, i18n.language) })}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  {extended && mine && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteNote.mutate(note.id)}
                      disabled={deleteNote.isPending}
                      aria-label={t("dashboardV2.notes.delete")}
                      data-testid={`button-delete-note-${note.id}`}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
