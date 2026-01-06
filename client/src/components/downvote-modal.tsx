import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DownvoteReason } from "@shared/schema";
import { cn } from "@/lib/utils";

const REASON_LABELS: Record<string, string> = {
  [DownvoteReason.TOO_FAR]: "Too far",
  [DownvoteReason.TOO_EXPENSIVE]: "Too pricey",
  [DownvoteReason.BAD_TIMING]: "Bad timing",
  [DownvoteReason.NOT_MY_VIBE]: "Not my vibe",
  [DownvoteReason.NOT_MY_TASTE]: "Not my taste",
  [DownvoteReason.DOESNT_FIT_GROUP]: "Doesn't fit group",
  [DownvoteReason.WRONG_NEIGHBORHOOD]: "Wrong area",
  [DownvoteReason.OTHER]: "Other",
};

interface DownvoteModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (reasons: string[], note?: string) => Promise<void>;
  suggestionName: string;
}

export function DownvoteModal({ open, onClose, onSubmit, suggestionName }: DownvoteModalProps) {
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleReason = (reason: string) => {
    setSelectedReasons(prev => 
      prev.includes(reason) 
        ? prev.filter(r => r !== reason)
        : [...prev, reason]
    );
  };

  const canSubmit = selectedReasons.length > 0 || note.trim().length >= 3;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await onSubmit(selectedReasons, note.trim() || undefined);
      setSelectedReasons([]);
      setNote("");
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedReasons([]);
    setNote("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-md border-white/10">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Not feeling it?</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Tell us why <span className="text-foreground font-medium">{suggestionName}</span> isn't the move
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {Object.entries(REASON_LABELS).map(([reason, label]) => (
              <button
                key={reason}
                onClick={() => toggleReason(reason)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                  selectedReasons.includes(reason)
                    ? "bg-red-500 text-white"
                    : "bg-white/5 text-muted-foreground hover:bg-white/10 border border-white/10"
                )}
                data-testid={`chip-reason-${reason}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">
              Or add a note {selectedReasons.length === 0 && "(3+ chars required)"}
            </label>
            <Textarea
              placeholder="What's not working for you?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="resize-none bg-white/5 border-white/10 text-sm h-20"
              data-testid="input-downvote-note"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={handleClose} disabled={isSubmitting} data-testid="button-cancel-downvote">
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!canSubmit || isSubmitting}
            className="bg-red-500 hover:bg-red-600 text-white"
            data-testid="button-submit-downvote"
          >
            {isSubmitting ? "Voting..." : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
