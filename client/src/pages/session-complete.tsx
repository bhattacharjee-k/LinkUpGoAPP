import React, { useEffect, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useApp } from '@/lib/context';
import { api } from '@/lib/api';
import { Layout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Star, MapPin, Clock, CheckCircle2, ArrowLeft, Download, MessageSquare, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const FEEDBACK_TAGS = [
  { id: 'great_vibe', label: 'Great Vibes', emoji: '✨' },
  { id: 'good_food', label: 'Good Food', emoji: '🍽️' },
  { id: 'good_drinks', label: 'Good Drinks', emoji: '🍹' },
  { id: 'good_service', label: 'Good Service', emoji: '👍' },
  { id: 'too_crowded', label: 'Too Crowded', emoji: '👥' },
  { id: 'too_loud', label: 'Too Loud', emoji: '🔊' },
  { id: 'too_expensive', label: 'Pricey', emoji: '💰' },
  { id: 'would_return', label: 'Would Return', emoji: '🔄' },
];

export function SessionComplete() {
  const [match, params] = useRoute('/session/:id/complete');
  const { getSession, user, refreshSession } = useApp();
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [review, setReview] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [existingFeedback, setExistingFeedback] = useState<any>(null);
  
  const session = getSession(params?.id || '');
  
  useEffect(() => {
    if (params?.id) {
      refreshSession(params.id);
      checkExistingFeedback();
    }
  }, [params?.id]);
  
  const checkExistingFeedback = async () => {
    try {
      const data = await api.feedback.get(params?.id || '');
      if (data.hasSubmitted && data.feedback) {
        const myFeedback = Array.isArray(data.feedback) 
          ? data.feedback.find((f: any) => f.userId === user?.id)
          : data.feedback;
        if (myFeedback) {
          setExistingFeedback(myFeedback);
          setRating(myFeedback.rating);
          setReview(myFeedback.review || '');
          setSelectedTags(myFeedback.tags || []);
          setHasSubmitted(true);
        }
      }
    } catch (error) {
      console.error('Error checking feedback:', error);
    }
  };
  
  if (!match || !session) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Session not found</p>
        </div>
      </Layout>
    );
  }
  
  const winningSuggestion = session.suggestions.find(s => s.id === session.winningOptionId);
  const sessionFilters = session.filters as any;
  
  const handleTagToggle = (tagId: string) => {
    setSelectedTags(prev => 
      prev.includes(tagId) 
        ? prev.filter(t => t !== tagId)
        : [...prev, tagId]
    );
  };
  
  const handleSubmitFeedback = async () => {
    if (rating === 0) {
      toast({ title: "Rating required", description: "Please rate your experience", variant: "destructive" });
      return;
    }
    
    setIsSubmitting(true);
    try {
      await api.feedback.submit(session.id, {
        suggestionId: winningSuggestion?.id,
        rating,
        review: review.trim() || null,
        tags: selectedTags,
        wouldRecommend: selectedTags.includes('would_return'),
      });
      
      setHasSubmitted(true);
      toast({ title: "Feedback saved!", description: "Thanks for rating. The AI Planner will remember your preferences!" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save feedback", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const generateCalendarFile = () => {
    if (!winningSuggestion || !sessionFilters?.specificDate) {
      toast({ title: "Missing info", description: "Date or venue not available", variant: "destructive" });
      return;
    }
    
    const eventDate = new Date(sessionFilters.specificDate);
    const startTime = sessionFilters.specificTime || '19:00';
    const [hours, minutes] = startTime.split(':').map(Number);
    eventDate.setHours(hours, minutes, 0, 0);
    
    const endDate = new Date(eventDate);
    endDate.setHours(endDate.getHours() + 3);
    
    const formatICSDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    };
    
    const venueName = winningSuggestion.name;
    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//VibeCheck//EN
BEGIN:VEVENT
UID:${session.id}@vibecheck.app
DTSTAMP:${formatICSDate(new Date())}
DTSTART:${formatICSDate(eventDate)}
DTEND:${formatICSDate(endDate)}
SUMMARY:${session.name || 'VibeCheck Plan'} at ${venueName}
DESCRIPTION:Locked in via VibeCheck! ${winningSuggestion.description || ''}
LOCATION:${venueName}
END:VEVENT
END:VCALENDAR`;
    
    const blob = new Blob([icsContent], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vibecheck-${session.id.slice(0, 8)}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({ title: "Calendar downloaded!", description: "Add it to your calendar app" });
  };
  
  return (
    <Layout>
      <div className="flex-1 flex flex-col max-w-lg mx-auto w-full px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setLocation(`/session/${session.id}`)}
            data-testid="button-back"
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Plan Locked In!</h1>
            <p className="text-muted-foreground text-sm">You're all set for your outing</p>
          </div>
        </div>
        
        {/* Winning Venue Card */}
        {winningSuggestion && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="border-green-500/30 bg-green-500/5">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <CheckCircle2 size={18} className="text-green-500" />
                      {winningSuggestion.name}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {winningSuggestion.description}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className="bg-green-500/20 text-green-400">
                    Winner
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  {sessionFilters?.specificDate && (
                    <span className="flex items-center gap-1">
                      <Calendar size={14} />
                      {format(new Date(sessionFilters.specificDate), 'MMM d, yyyy')}
                    </span>
                  )}
                  {sessionFilters?.specificTime && (
                    <span className="flex items-center gap-1">
                      <Clock size={14} />
                      {sessionFilters.specificTime}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <MapPin size={14} />
                    {winningSuggestion.city}
                  </span>
                </div>
                
                {winningSuggestion.whyExplanation && (
                  <div className="bg-primary/10 rounded-lg p-3 text-sm">
                    <div className="flex items-center gap-1 text-primary text-xs font-medium mb-1">
                      <Sparkles size={12} />
                      Why we picked this
                    </div>
                    <p className="text-muted-foreground">{winningSuggestion.whyExplanation}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
        
        {/* Calendar Invite */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar size={16} className="text-primary" />
                Add to Calendar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={generateCalendarFile}
                className="w-full bg-primary text-black font-bold"
                data-testid="button-download-calendar"
              >
                <Download size={16} className="mr-2" />
                Download Calendar Invite (.ics)
              </Button>
            </CardContent>
          </Card>
        </motion.div>
        
        {/* Rating & Feedback */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Star size={16} className="text-yellow-500" />
                {hasSubmitted ? 'Your Rating' : 'Rate Your Experience'}
              </CardTitle>
              <CardDescription>
                {hasSubmitted 
                  ? 'Thanks! The AI Planner will remember your preferences' 
                  : 'Help the AI Planner give better suggestions next time'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Star Rating */}
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => !hasSubmitted && setRating(star)}
                    onMouseEnter={() => !hasSubmitted && setHoverRating(star)}
                    onMouseLeave={() => !hasSubmitted && setHoverRating(0)}
                    disabled={hasSubmitted}
                    className={cn(
                      "transition-all duration-150",
                      hasSubmitted ? "cursor-default" : "cursor-pointer hover:scale-110"
                    )}
                    data-testid={`star-${star}`}
                  >
                    <Star
                      size={36}
                      className={cn(
                        "transition-colors",
                        (hoverRating || rating) >= star
                          ? "fill-yellow-500 text-yellow-500"
                          : "text-muted-foreground"
                      )}
                    />
                  </button>
                ))}
              </div>
              
              {/* Feedback Tags */}
              <div className="flex flex-wrap gap-2 justify-center">
                {FEEDBACK_TAGS.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant={selectedTags.includes(tag.id) ? "default" : "outline"}
                    className={cn(
                      "cursor-pointer transition-all",
                      selectedTags.includes(tag.id) 
                        ? "bg-primary text-black" 
                        : "hover:bg-white/10",
                      hasSubmitted && "cursor-default"
                    )}
                    onClick={() => !hasSubmitted && handleTagToggle(tag.id)}
                    data-testid={`tag-${tag.id}`}
                  >
                    {tag.emoji} {tag.label}
                  </Badge>
                ))}
              </div>
              
              {/* Review Text */}
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground flex items-center gap-2">
                  <MessageSquare size={14} />
                  Comments (The AI Planner will remember these!)
                </label>
                <Textarea
                  placeholder="What did you love? What could be better? The Planner learns from your feedback..."
                  value={review}
                  onChange={(e) => !hasSubmitted && setReview(e.target.value)}
                  disabled={hasSubmitted}
                  className="min-h-[100px] resize-none"
                  data-testid="textarea-review"
                />
              </div>
              
              {/* Submit Button */}
              {!hasSubmitted && (
                <Button
                  onClick={handleSubmitFeedback}
                  disabled={isSubmitting || rating === 0}
                  className="w-full bg-primary text-black font-bold"
                  data-testid="button-submit-feedback"
                >
                  {isSubmitting ? 'Saving...' : 'Save Feedback'}
                </Button>
              )}
              
              {hasSubmitted && (
                <div className="text-center text-sm text-green-400 flex items-center justify-center gap-2">
                  <CheckCircle2 size={16} />
                  Feedback saved! The Planner will remember this.
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
        
        {/* Navigation Buttons */}
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => setLocation('/')}
            className="w-full bg-primary text-black font-bold"
            data-testid="button-back-to-home"
          >
            Back to Home
          </Button>
          <Button
            variant="outline"
            onClick={() => setLocation(`/session/${session.id}`)}
            className="w-full"
            data-testid="button-back-to-session"
          >
            View Session Details
          </Button>
        </div>
      </div>
    </Layout>
  );
}
