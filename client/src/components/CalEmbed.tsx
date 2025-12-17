import { useEffect, useState } from "react";
import Cal, { getCalApi } from "@calcom/embed-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

interface CalEmbedProps {
  calLink: string;
  mentorName: string;
  bookingId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CalEmbed({ calLink, mentorName, bookingId, open, onOpenChange }: CalEmbedProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [calApiReady, setCalApiReady] = useState(false);

  const calUsername = extractCalUsername(calLink);
  
  useEffect(() => {
    if (!open) {
      setIsLoading(true);
      return;
    }
    
    let isMounted = true;
    
    (async function () {
      const cal = await getCalApi();
      
      if (!isMounted) return;
      
      cal("ui", {
        styles: {
          branding: { brandColor: "#FF9900" },
        },
        hideEventTypeDetails: false,
        layout: "month_view",
      });
      
      if (!calApiReady) {
        cal("on", {
          action: "bookingSuccessful",
          callback: (e: { detail: { data: unknown } }) => {
            console.log("Booking successful:", e.detail.data);
            onOpenChange(false);
          },
        });
        setCalApiReady(true);
      }
      
      setIsLoading(false);
    })();
    
    return () => {
      isMounted = false;
    };
  }, [open, onOpenChange, calApiReady]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-0" data-testid="dialog-cal-embed">
        <DialogHeader className="p-6 pb-0">
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
  
  useEffect(() => {
    (async function () {
      const cal = await getCalApi();
      cal("ui", {
        styles: {
          branding: { brandColor: "#FF9900" },
        },
        hideEventTypeDetails: false,
        layout: "month_view",
      });
      setIsLoading(false);
    })();
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
