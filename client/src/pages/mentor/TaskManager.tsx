import { useId, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Clock, ListTodo, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";
import type { MentorTask } from "@/lib/database";
import { formatDate } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import { mentorService } from "@/lib/services";
import { cn } from "@/lib/utils";
import { BookingsError, PanelSection } from "@/pages/mentee/shared";

type Priority = "low" | "medium" | "high";
const PRIORITY_TONE: Record<Priority, "danger" | "warning" | "neutral"> = { high: "danger", medium: "warning", low: "neutral" };

/**
 * Personal follow-ups (mentor_tasks). Aligned: dates via lib/format, unique
 * label ids, checkboxes named by the task title, no nested scroll container,
 * an EmptyState per list, an error state with retry.
 */
export default function TaskManager({ mentorId }: { mentorId: string }) {
  const { t, i18n } = useTranslation();
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ title: "", description: "", priority: "medium" as Priority, due_date: "" });
  const [titleError, setTitleError] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const tasksQuery = useQuery<MentorTask[]>({
    queryKey: ["mentor", mentorId, "tasks"],
    queryFn: () => mentorService.getTasks(mentorId),
  });

  const createTask = useMutation({
    mutationFn: () =>
      mentorService.createTask({
        mentor_id: mentorId,
        title: draft.title.trim(),
        description: draft.description.trim() || undefined,
        priority: draft.priority,
        due_date: draft.due_date ? new Date(draft.due_date).toISOString() : undefined,
        status: "pending",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mentor", mentorId, "tasks"] });
      setOpen(false);
      setDraft({ title: "", description: "", priority: "medium", due_date: "" });
      setTitleError(false);
      toast.success(t("dashboardV2.tasks.created"));
    },
    onError: () => toast.error(t("dashboardV2.tasks.createError")),
  });

  const toggleTask = useMutation({
    mutationFn: (task: MentorTask) => {
      const next = task.status === "completed" ? "pending" : "completed";
      return mentorService.updateTask(task.id, { status: next, completed_at: next === "completed" ? new Date().toISOString() : undefined });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mentor", mentorId, "tasks"] }),
    onError: () => toast.error(t("dashboardV2.tasks.updateError")),
  });

  // The form is noValidate, so the empty-title case announces next to the
  // field and moves focus there instead of failing silently.
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim()) {
      setTitleError(true);
      titleRef.current?.focus();
      return;
    }
    setTitleError(false);
    createTask.mutate();
  };

  const tasks = tasksQuery.data ?? [];
  const pending = tasks.filter((x) => x.status !== "completed" && x.status !== "canceled");
  const done = tasks.filter((x) => x.status === "completed");

  const renderTask = (task: MentorTask) => {
    const completed = task.status === "completed";
    const titleId = `${ids}-task-${task.id}`;
    return (
      <li key={task.id} className={cn("flex items-start gap-3 rounded-lg border border-border bg-card p-3", completed && "bg-muted/40")} data-testid={completed ? `task-completed-${task.id}` : `task-${task.id}`}>
        <Checkbox
          checked={completed}
          onCheckedChange={() => toggleTask.mutate(task)}
          aria-labelledby={titleId}
          className="mt-1"
          data-testid={completed ? `checkbox-task-completed-${task.id}` : `checkbox-task-${task.id}`}
        />
        <div className="min-w-0 flex-1">
          <p id={titleId} dir="auto" className={cn("text-body-sm font-medium text-foreground", completed && "text-muted-foreground line-through")}>
            {task.title}
          </p>
          {task.description && !completed && (
            <p dir="auto" className="text-body-sm text-muted-foreground text-pretty">
              {task.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
            {!completed && <Badge tone={PRIORITY_TONE[task.priority as Priority] ?? "neutral"}>{t(`dashboardV2.tasks.priority.${task.priority}`)}</Badge>}
            {!completed && task.due_date && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden="true" />
                {/* A due date is a calendar day, saved as its UTC midnight: show that day in every zone. */}
                {t("dashboardV2.tasks.due", { date: formatDate(task.due_date, i18n.language, "UTC") })}
              </span>
            )}
            {completed && task.completed_at && <span>{t("dashboardV2.tasks.completedOn", { date: formatDate(task.completed_at, i18n.language) })}</span>}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm text-muted-foreground">{t("dashboardV2.tasks.intro")}</p>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)} data-testid="button-add-task">
          <Plus aria-hidden="true" />
          {t("dashboardV2.tasks.add")}
        </Button>
      </div>

      {tasksQuery.isLoading ? (
        <div role="status" aria-busy="true" className="space-y-3">
          <span className="sr-only">{t("common.loading")}</span>
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ) : tasksQuery.isError ? (
        <BookingsError onRetry={() => tasksQuery.refetch()} />
      ) : (
        <>
          <PanelSection id="tasks-open" title={t("dashboardV2.tasks.open", { count: pending.length })}>
            {pending.length === 0 ? (
              <EmptyState icon={ListTodo} title={t("dashboardV2.tasks.emptyOpenTitle")} description={t("dashboardV2.tasks.emptyOpenBody")} className="py-8" />
            ) : (
              <ul className="space-y-2">{pending.map(renderTask)}</ul>
            )}
          </PanelSection>
          {done.length > 0 && (
            <PanelSection id="tasks-done" title={t("dashboardV2.tasks.done", { count: done.length })}>
              <ul className="space-y-2">{done.map(renderTask)}</ul>
            </PanelSection>
          )}
        </>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setTitleError(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dashboardV2.tasks.newTitle")}</DialogTitle>
            <DialogDescription>{t("dashboardV2.tasks.newDesc")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor={`${ids}-title`}>{t("dashboardV2.tasks.titleLabel")}</Label>
              <Input
                ref={titleRef}
                id={`${ids}-title`}
                dir="auto"
                value={draft.title}
                onChange={(e) => {
                  setDraft({ ...draft, title: e.target.value });
                  if (titleError && e.target.value.trim()) setTitleError(false);
                }}
                required
                aria-invalid={titleError || undefined}
                aria-describedby={titleError ? `${ids}-title-error` : undefined}
                data-testid="input-task-title"
              />
              {titleError && (
                <p id={`${ids}-title-error`} role="alert" className="text-caption text-destructive" data-testid="error-task-title">
                  {t("dashboardV2.tasks.titleRequired")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${ids}-desc`}>{t("dashboardV2.tasks.descLabel")}</Label>
              <Textarea id={`${ids}-desc`} dir="auto" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} data-testid="input-task-description" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor={`${ids}-priority`}>{t("dashboardV2.tasks.priorityLabel")}</Label>
                <Select value={draft.priority} onValueChange={(value) => setDraft({ ...draft, priority: value as Priority })}>
                  <SelectTrigger id={`${ids}-priority`} data-testid="select-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["low", "medium", "high"] as Priority[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        {t(`dashboardV2.tasks.priority.${p}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${ids}-due`}>{t("dashboardV2.tasks.dueLabel")}</Label>
                <Input id={`${ids}-due`} type="date" value={draft.due_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} data-testid="input-due-date" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" variant="secondary" loading={createTask.isPending} data-testid="button-submit-task">
                {t("dashboardV2.tasks.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
