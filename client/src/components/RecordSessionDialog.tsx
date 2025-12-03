import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CheckCircle2 } from "lucide-react";

const recordSessionSchema = z.object({
  menteeName: z.string().min(2, "Name must be at least 2 characters"),
  menteeEmail: z.string().email("Please enter a valid email"),
});

type RecordSessionForm = z.infer<typeof recordSessionSchema>;

interface RecordSessionDialogProps {
  mentorId: string;
  mentorName: string;
}

export function RecordSessionDialog({ mentorId, mentorName }: RecordSessionDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<RecordSessionForm>({
    resolver: zodResolver(recordSessionSchema),
    defaultValues: {
      menteeName: "",
      menteeEmail: "",
    },
  });

  const recordMutation = useMutation({
    mutationFn: async (data: RecordSessionForm) => {
      return await apiRequest("POST", "/api/sessions", {
        mentorId,
        menteeName: data.menteeName,
        menteeEmail: data.menteeEmail,
      });
    },
    onSuccess: (_, variables) => {
      localStorage.setItem("menteeEmail", variables.menteeEmail);
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mentees", variables.menteeEmail, "sessions"] });
      toast({
        title: "Session Recorded!",
        description: `Your session with ${mentorName} has been recorded successfully.`,
      });
      form.reset();
      setOpen(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to record session. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: RecordSessionForm) => {
    recordMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full" data-testid="button-record-session">
          <CheckCircle2 className="w-4 h-4 mr-2" />
          I Booked a Session
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="dialog-record-session">
        <DialogHeader>
          <DialogTitle>Record Your Session</DialogTitle>
          <DialogDescription>
            After booking your session with {mentorName} on Cal.com, please record it here for tracking purposes.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="menteeName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Your Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="John Doe"
                      data-testid="input-mentee-name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="menteeEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Your Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="john@example.com"
                      data-testid="input-mentee-email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full"
              disabled={recordMutation.isPending}
              data-testid="button-submit-session"
            >
              {recordMutation.isPending ? "Recording..." : "Record Session"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
