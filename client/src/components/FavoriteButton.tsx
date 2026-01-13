import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Local type for favorites since it's not in the shared schema
interface Favorite {
  mentorId: string;
  menteeId?: string;
}

interface FavoriteButtonProps {
  mentorId: string;
  mentorName: string;
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm" | "lg" | "icon";
  showLabel?: boolean;
}

export function FavoriteButton({
  mentorId,
  mentorName,
  variant = "ghost",
  size = "icon",
  showLabel = false
}: FavoriteButtonProps) {
  const { toast } = useToast();
  const [menteeEmail, setMenteeEmail] = useState<string | null>(null);

  useEffect(() => {
    const storedEmail = localStorage.getItem("menteeEmail");
    setMenteeEmail(storedEmail);
  }, []);

  const { data: favorites } = useQuery<Favorite[]>({
    queryKey: ["/api/mentees", menteeEmail, "favorites"],
    enabled: !!menteeEmail,
  });

  const isFavorited = favorites?.some(f => f.mentorId === mentorId) || false;

  const addFavoriteMutation = useMutation({
    mutationFn: async () => {
      if (!menteeEmail) {
        throw new Error("Please record a session first to use favorites");
      }
      return await apiRequest("POST", `/api/mentees/${menteeEmail}/favorites`, {
        mentorId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mentees", menteeEmail, "favorites"] });
      toast({
        title: "Added to Favorites",
        description: `${mentorName} has been added to your favorites.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add to favorites. Please try again.",
        variant: "destructive",
      });
    },
  });

  const removeFavoriteMutation = useMutation({
    mutationFn: async () => {
      if (!menteeEmail) {
        throw new Error("Email not found");
      }
      return await apiRequest("DELETE", `/api/mentees/${menteeEmail}/favorites/${mentorId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mentees", menteeEmail, "favorites"] });
      toast({
        title: "Removed from Favorites",
        description: `${mentorName} has been removed from your favorites.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove from favorites. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleToggleFavorite = () => {
    if (!menteeEmail) {
      toast({
        title: "Email Required",
        description: "Please record a session first to use the favorites feature.",
        variant: "destructive",
      });
      return;
    }

    if (isFavorited) {
      removeFavoriteMutation.mutate();
    } else {
      addFavoriteMutation.mutate();
    }
  };

  const isPending = addFavoriteMutation.isPending || removeFavoriteMutation.isPending;

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleToggleFavorite}
      disabled={isPending}
      data-testid={`button-favorite-${mentorId}`}
    >
      <Heart
        className={`w-4 h-4 ${isFavorited ? "fill-current text-red-500" : ""} ${showLabel ? "mr-2" : ""}`}
      />
      {showLabel && (isFavorited ? "Favorited" : "Add to Favorites")}
    </Button>
  );
}
