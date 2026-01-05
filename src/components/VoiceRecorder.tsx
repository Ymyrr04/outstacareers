import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square, Play, Trash2, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface VoiceRecorderProps {
  onRecordingComplete: (url: string) => void;
  maxDuration?: number; // in seconds
  existingUrl?: string;
}

export function VoiceRecorder({ 
  onRecordingComplete, 
  maxDuration = 120,
  existingUrl 
}: VoiceRecorderProps) {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(existingUrl || null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(existingUrl || null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl && !existingUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl, existingUrl]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { 
          type: mediaRecorder.mimeType 
        });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingTime(0);
      setUploadedUrl(null);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= maxDuration - 1) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast({
        title: 'Microphone access denied',
        description: 'Please allow microphone access to record your voice introduction.',
        variant: 'destructive',
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
    if (audioUrl && !existingUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setUploadedUrl(null);
    setRecordingTime(0);
    onRecordingComplete('');
  };

  const uploadRecording = async () => {
    if (!audioBlob) return;

    setIsUploading(true);
    try {
      const fileName = `voice-intro-${Date.now()}.webm`;
      
      const { data, error } = await supabase.storage
        .from('voice-recordings')
        .upload(fileName, audioBlob, {
          contentType: audioBlob.type,
          upsert: false,
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('voice-recordings')
        .getPublicUrl(data.path);

      setUploadedUrl(urlData.publicUrl);
      onRecordingComplete(urlData.publicUrl);

      toast({
        title: 'Recording saved',
        description: 'Your voice introduction has been saved successfully.',
      });
    } catch (error: any) {
      console.error('Error uploading recording:', error);
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to save recording. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Hidden audio element for playback */}
      <audio 
        ref={audioRef} 
        src={audioUrl || undefined} 
        onEnded={() => setIsPlaying(false)}
      />

      {/* Recording Controls */}
      <div className="flex flex-col items-center gap-4 p-6 border-2 border-dashed rounded-lg bg-muted/30">
        {!audioUrl ? (
          <>
            {/* Recording button */}
            <Button
              type="button"
              size="lg"
              onClick={isRecording ? stopRecording : startRecording}
              className={isRecording ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {isRecording ? (
                <>
                  <Square className="h-5 w-5 mr-2 fill-current" />
                  Stop Recording
                </>
              ) : (
                <>
                  <Mic className="h-5 w-5 mr-2" />
                  Start Recording
                </>
              )}
            </Button>

            {/* Timer */}
            {isRecording && (
              <div className="text-center">
                <div className="text-2xl font-mono font-bold text-red-600">
                  {formatTime(recordingTime)}
                </div>
                <p className="text-sm text-muted-foreground">
                  Max: {formatTime(maxDuration)}
                </p>
              </div>
            )}

            {/* Recording indicator */}
            {isRecording && (
              <div className="flex items-center gap-2 text-red-600">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
                </span>
                <span className="text-sm font-medium">Recording...</span>
              </div>
            )}

            {!isRecording && (
              <p className="text-sm text-muted-foreground text-center">
                Click to record your voice introduction.<br />
                Keep it brief - introduce yourself and your relevant experience.
              </p>
            )}
          </>
        ) : (
          <>
            {/* Playback controls */}
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={isPlaying ? stopPlaying : playRecording}
              >
                {isPlaying ? (
                  <>
                    <Square className="h-4 w-4 mr-1.5 fill-current" />
                    Stop
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-1.5 fill-current" />
                    Play
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={deleteRecording}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              Duration: {formatTime(recordingTime)}
            </p>

            {/* Upload button */}
            {!uploadedUrl && audioBlob && (
              <Button
                type="button"
                onClick={uploadRecording}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Recording'
                )}
              </Button>
            )}

            {/* Success indicator */}
            {uploadedUrl && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span className="text-sm font-medium">Recording saved!</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}