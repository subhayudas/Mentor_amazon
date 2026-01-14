import { useEffect, useState } from "react";
import Cal from "@calcom/embed-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface CalEmbedProps {
  calLink: string;
  mentorName: string;
  bookingId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CalEmbed({ calLink, mentorName, bookingId, open, onOpenChange }: CalEmbedProps) {
  const [isLoading, setIsLoading] = useState(true);

  const calUsername = extractCalUsername(calLink);
  
  useEffect(() => {
    if (!open) {
      setIsLoading(true);
      return;
    }
    
    // Set a timeout to hide loading state
    // This gives the Cal.com iframe time to initialize
    const loadingTimeout = setTimeout(() => {
      setIsLoading(false);
    }, 1500);
    
    return () => {
      clearTimeout(loadingTimeout);
    };
  }, [open]);

  if (!calUsername) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>Schedule a Session</DialogTitle>
            <DialogDescription>
              Unable to load the scheduling calendar. The mentor's calendar link may not be configured correctly.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Calendar not available</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Handler to close the dialog
  const handleCloseDialog = () => {
    console.log("Close dialog clicked");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-0 relative [&>button:last-child]:hidden" data-testid="dialog-cal-embed">
        {/* Use a Button component for reliable close behavior */}
        <Button
          variant="outline"
          size="icon"
          className="absolute right-4 top-4 z-[100] rounded-sm"
          onClick={handleCloseDialog}
          data-testid="cal-embed-close-button"
        >
          <X className="h-5 w-5" />
          <span className="sr-only">Close</span>
        </Button>
        <DialogHeader className="p-6 pb-0 pr-16">
          <DialogTitle>Schedule a Session with {mentorName}</DialogTitle>
          <DialogDescription>
            Select a time slot that works for you. Once booked, you'll receive a confirmation email.
          </DialogDescription>
        </DialogHeader>
        <div className="h-[70vh] overflow-auto p-4">
          {isLoading && (
            <div className="space-y-4 p-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-[400px] w-full" />
            </div>
          )}
          <Cal
            calLink={calUsername}
            style={{ width: "100%", height: "100%", overflow: "auto" }}
            config={{
              name: "Mentee",
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function extractCalUsername(calLink: string): string | null {
  if (!calLink) return null;
  
  try {
    if (calLink.startsWith("http")) {
      const url = new URL(calLink);
      const pathname = url.pathname.replace(/^\//, "");
      return pathname || null;
    }
    return calLink;
  } catch {
    return calLink.replace(/^\//, "") || null;
  }
}

export function CalEmbedInline({ calLink, bookingId }: { calLink: string; bookingId?: string }) {
  const [isLoading, setIsLoading] = useState(true);
  
  const calUsername = extractCalUsername(calLink);
  
  // Use a simple timeout fallback to hide loading state
  useEffect(() => {
    const loadingTimeout = setTimeout(() => {
      setIsLoading(false);
    }, 2000);
    
    return () => clearTimeout(loadingTimeout);
  }, []);

  if (!calUsername) {
    return (
      <div className="flex items-center justify-center h-[400px] border rounded-lg bg-muted/50">
        <p className="text-muted-foreground">Calendar not available. The mentor's calendar link may not be configured.</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-[500px]" data-testid="cal-embed-inline">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <div className="space-y-4 w-full max-w-md">
            <Skeleton className="h-8 w-48 mx-auto" />
            <Skeleton className="h-[300px] w-full" />
          </div>
        </div>
      )}
      <Cal
        calLink={calUsername}
        style={{ width: "100%", height: "100%", minHeight: "500px", overflow: "auto" }}
        config={{}}
      />
    </div>
  );
}
