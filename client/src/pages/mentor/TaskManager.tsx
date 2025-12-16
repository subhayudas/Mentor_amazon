import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, ListTodo, Clock, CheckCircle2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import type { MentorTask } from "@shared/schema";

interface TaskManagerProps {
  mentorId: string;
}

export default function TaskManager({ mentorId }: TaskManagerProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    priority: "medium" as "low" | "medium" | "high",
    due_date: "",
  });

  const { data: tasks, isLoading } = useQuery<MentorTask[]>({
    queryKey: ['/api/mentor', mentorId, 'tasks'],
    enabled: !!mentorId,
  });

  const createTaskMutation = useMutation({
    mutationFn: async (task: typeof newTask) => {
      return apiRequest("POST", `/api/mentor/${mentorId}/tasks`, {
        ...task,
        due_date: task.due_date ? new Date(task.due_date).toISOString() : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/mentor', mentorId, 'tasks'] });
      setIsDialogOpen(false);
      setNewTask({ title: "", description: "", priority: "medium", due_date: "" });
      toast({
        title: t('common.success'),
        description: t('mentorPortal.taskCreated'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('mentorPortal.taskCreateError'),
        variant: "destructive",
      });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: string; updates: Partial<MentorTask> }) => {
      return apiRequest("PATCH", `/api/mentor/${mentorId}/tasks/${taskId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/mentor', mentorId, 'tasks'] });
      toast({
        title: t('common.success'),
        description: t('mentorPortal.taskUpdated'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('mentorPortal.taskUpdateError'),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title.trim()) return;
    createTaskMutation.mutate(newTask);
  };

  const handleToggleComplete = (task: MentorTask) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    updateTaskMutation.mutate({
      taskId: task.id,
      updates: { 
        status: newStatus,
        completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
      },
    });
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return <Badge variant="destructive">{t('mentorPortal.priorityHigh')}</Badge>;
      case 'medium':
        return <Badge variant="secondary">{t('mentorPortal.priorityMedium')}</Badge>;
      case 'low':
        return <Badge variant="outline">{t('mentorPortal.priorityLow')}</Badge>;
      default:
        return null;
    }
  };

  const pendingTasks = tasks?.filter(t => t.status !== 'completed' && t.status !== 'canceled') ?? [];
  const completedTasks = tasks?.filter(t => t.status === 'completed') ?? [];

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-task-manager-title">
            {t('mentorPortal.tasksFollowups')}
          </h1>
          <p className="text-muted-foreground">
            {t('mentorPortal.tasksSubtitle')}
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-task">
              <Plus className="w-4 h-4 mr-2" />
              {t('mentorPortal.addTask')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('mentorPortal.newTask')}</DialogTitle>
              <DialogDescription>
                {t('mentorPortal.newTaskDescription')}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">{t('mentorPortal.taskTitle')}</Label>
                <Input
                  id="title"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder={t('mentorPortal.taskTitlePlaceholder')}
                  data-testid="input-task-title"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t('mentorPortal.taskDescription')}</Label>
                <Textarea
                  id="description"
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  placeholder={t('mentorPortal.taskDescriptionPlaceholder')}
                  data-testid="input-task-description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="priority">{t('mentorPortal.priority')}</Label>
                  <Select
                    value={newTask.priority}
                    onValueChange={(value: "low" | "medium" | "high") => 
                      setNewTask({ ...newTask, priority: value })
                    }
                  >
                    <SelectTrigger data-testid="select-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">{t('mentorPortal.priorityLow')}</SelectItem>
                      <SelectItem value="medium">{t('mentorPortal.priorityMedium')}</SelectItem>
                      <SelectItem value="high">{t('mentorPortal.priorityHigh')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="due_date">{t('mentorPortal.dueDate')}</Label>
                  <Input
                    id="due_date"
                    type="date"
                    value={newTask.due_date}
                    onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                    data-testid="input-due-date"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={createTaskMutation.isPending}
                  data-testid="button-submit-task"
                >
                  {createTaskMutation.isPending ? t('common.loading') : t('mentorPortal.createTask')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListTodo className="w-5 h-5" />
              {t('mentorPortal.pendingTasks')}
              {pendingTasks.length > 0 && (
                <Badge variant="secondary">{pendingTasks.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : pendingTasks.length > 0 ? (
              <div className="space-y-3">
                {pendingTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 p-3 border rounded-lg"
                    data-testid={`task-${task.id}`}
                  >
                    <Checkbox
                      checked={task.status === 'completed'}
                      onCheckedChange={() => handleToggleComplete(task)}
                      data-testid={`checkbox-task-${task.id}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{task.title}</p>
                      {task.description && (
                        <p className="text-sm text-muted-foreground truncate">
                          {task.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {getPriorityBadge(task.priority)}
                        {task.due_date && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {format(parseISO(task.due_date), 'MMM d, yyyy')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <ListTodo className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {t('mentorPortal.noPendingTasks')}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              {t('mentorPortal.completedTasks')}
              {completedTasks.length > 0 && (
                <Badge variant="secondary">{completedTasks.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : completedTasks.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {completedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 p-3 border rounded-lg opacity-60"
                    data-testid={`task-completed-${task.id}`}
                  >
                    <Checkbox
                      checked={true}
                      onCheckedChange={() => handleToggleComplete(task)}
                      data-testid={`checkbox-task-completed-${task.id}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium line-through">{task.title}</p>
                      {task.completed_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('mentorPortal.completedOn')} {format(parseISO(task.completed_at), 'MMM d, yyyy')}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckCircle2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {t('mentorPortal.noCompletedTasks')}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
