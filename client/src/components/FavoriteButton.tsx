import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const [isFavorited, setIsFavorited] = useState(false);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    // Load favorites from localStorage
    const favorites = JSON.parse(localStorage.getItem('mentorFavorites') || '[]');
    setIsFavorited(favorites.includes(mentorId));
  }, [mentorId]);

  const handleToggleFavorite = () => {
    setIsPending(true);
    
    try {
      const favorites = JSON.parse(localStorage.getItem('mentorFavorites') || '[]');
      
      if (isFavorited) {
        const updated = favorites.filter((id: string) => id !== mentorId);
        localStorage.setItem('mentorFavorites', JSON.stringify(updated));
        setIsFavorited(false);
        toast({
          title: "Removed from Favorites",
          description: `${mentorName} has been removed from your favorites.`,
        });
      } else {
        favorites.push(mentorId);
        localStorage.setItem('mentorFavorites', JSON.stringify(favorites));
        setIsFavorited(true);
        toast({
          title: "Added to Favorites",
          description: `${mentorName} has been added to your favorites.`,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update favorites. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsPending(false);
    }
  };

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
