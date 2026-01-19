import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Play, Trash2, Upload, CheckCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface VoiceQuestion {
  id: string;
  question_text: string;
  question_context: string;
}

interface VoiceQuestionStepProps {
  question: VoiceQuestion;
  questionNumber: number;
  totalQuestions: number;
  onAnswer: (recordingUrl: string, durationSeconds: number) => void;
}

export function VoiceQuestionStep({
  question,
  questionNumber,
  totalQuestions,
  onAnswer
}: VoiceQuestionStepProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const MAX_DURATION = 120; // 2 minutes max per answer

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // Reset state when question changes
  useEffect(() => {
    setIsRecording(false);
    setRecordingTime(0);
    setAudioBlob(null);
    setAudioUrl(null);
    setIsPlaying(false);
    setIsUploading(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [question.id]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Determine best supported MIME type for the browser
  const getSupportedMimeType = (): string => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/aac',
      'audio/ogg;codecs=opus',
      'audio/wav',
      ''  // Empty string = browser default
    ];
    
    for (const type of types) {
      if (type === '' || MediaRecorder.isTypeSupported(type)) {
        console.log('Using MIME type:', type || 'browser default');
        return type;
      }
    }
    return '';
  };

  const startRecording = async () => {
    try {
      // Check if MediaRecorder is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast({
          title: "Not Supported",
          description: "Voice recording is not supported on this browser. Please use Chrome, Firefox, or Safari.",
          variant: "destructive"
        });
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      const mimeType = getSupportedMimeType();
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      
      let mediaRecorder: MediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(stream, options);
      } catch (e) {
        // Fallback without options
        console.warn('MediaRecorder with options failed, trying without:', e);
        mediaRecorder = new MediaRecorder(stream);
      }
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const actualMimeType = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: actualMimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        toast({
          title: "Recording Error",
          description: "An error occurred while recording. Please try again.",
          variant: "destructive"
        });
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };

      // Use timeslice for more reliable data capture on mobile
      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= MAX_DURATION - 1) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (error: any) {
      console.error('Error accessing microphone:', error);
      
      let errorMessage = "Unable to access your microphone. Please check permissions.";
      if (error.name === 'NotAllowedError') {
        errorMessage = "Microphone access denied. Please allow microphone access in your browser settings and refresh the page.";
      } else if (error.name === 'NotFoundError') {
        errorMessage = "No microphone found. Please connect a microphone and try again.";
      } else if (error.name === 'NotSupportedError') {
        errorMessage = "Voice recording is not supported on this device/browser.";
      }
      
      toast({
        title: "Microphone Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const playRecording = () => {
    if (audioUrl && audioRef.current) {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const stopPlaying = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };

  const deleteRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    setIsPlaying(false);
  };

  const submitRecording = async () => {
    if (!audioBlob) return;

    setIsUploading(true);

    try {
      // Determine file extension based on MIME type
      const mimeType = audioBlob.type || 'audio/webm';
      let extension = 'webm';
      if (mimeType.includes('mp4') || mimeType.includes('m4a')) {
        extension = 'mp4';
      } else if (mimeType.includes('aac')) {
        extension = 'aac';
      } else if (mimeType.includes('ogg')) {
        extension = 'ogg';
      } else if (mimeType.includes('wav')) {
        extension = 'wav';
      }
      
      const fileName = `interview/${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('voice-recordings')
        .upload(fileName, audioBlob, {
          contentType: mimeType
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('voice-recordings')
        .getPublicUrl(fileName);

      onAnswer(urlData.publicUrl, recordingTime);
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload recording. Please try again.",
        variant: "destructive"
      });
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <audio 
        ref={audioRef} 
        src={audioUrl || undefined}
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />

      {/* Question Card */}
      <div className="bg-muted/50 rounded-lg p-6">
        <div className="flex items-start gap-5">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl shadow-md">
            {questionNumber}
          </div>
          <div className="flex-1 select-none" onCopy={(e) => e.preventDefault()}>
            <p className="text-foreground font-medium text-xl leading-relaxed pointer-events-none">
              {question.question_text}
            </p>
          </div>
        </div>
      </div>

      {/* Recording Controls */}
      <div className="flex flex-col items-center gap-4 py-4">
        {!audioBlob ? (
          <>
            <Button
              size="lg"
              onClick={isRecording ? stopRecording : startRecording}
              className={`w-20 h-20 rounded-full ${
                isRecording ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90'
              }`}
            >
              {isRecording ? (
                <Square className="w-8 h-8" />
              ) : (
                <Mic className="w-8 h-8" />
              )}
            </Button>
            
            <div className="text-center">
              {isRecording ? (
                <>
                  <p className="text-2xl font-mono font-semibold text-destructive">
                    {formatTime(recordingTime)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Recording... (max {formatTime(MAX_DURATION)})
                  </p>
                  <div className="flex items-center justify-center gap-1 mt-2">
                    <span className="w-2 h-2 bg-destructive rounded-full animate-pulse" />
                    <span className="text-xs text-destructive">Recording</span>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Click to start recording your answer
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Speak clearly for 30-90 seconds
                  </p>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={isPlaying ? stopPlaying : playRecording}
              >
                {isPlaying ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
              <span className="text-lg font-mono">{formatTime(recordingTime)}</span>
              <Button
                variant="outline"
                size="icon"
                onClick={deleteRecording}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            <Button
              onClick={submitRecording}
              disabled={isUploading}
              className="min-w-[200px]"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Submit Answer
                </>
              )}
            </Button>
          </>
        )}
      </div>

      {/* Tips */}
      <div className="bg-primary/5 rounded-lg p-4">
        <p className="text-xs text-muted-foreground">
          <strong>Tips:</strong> Take a moment to think before answering. 
          Speak clearly and provide specific examples from your experience.
          You can re-record if needed before submitting.
        </p>
      </div>
    </div>
  );
}
