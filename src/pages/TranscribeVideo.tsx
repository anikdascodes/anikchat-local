import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
    ArrowLeft,
    Upload,
    Video,
    FileAudio,
    Copy,
    Check,
    Loader2,
    Sparkles,
    Volume2,
    AlertCircle,
    RefreshCw,
    Settings,
    ChevronDown,
    Mic,
    Wand2,
    FileText,
    Clock,
    Zap,
    Music,
    X,
    Play
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { useConfig } from '@/hooks/useConfig';
import { APIConfig, defaultConfig, getAudioModels, LLMProvider, LLMModel } from '@/types/chat';
import { cn } from '@/lib/utils';

// Constants
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB limit
const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo'];
const SUPPORTED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/flac', 'audio/m4a', 'audio/x-m4a'];

type TranscriptionState = 'idle' | 'uploading' | 'processing' | 'transcribing' | 'done' | 'error';

/**
 * Transcribe audio using provider's API
 */
async function transcribeAudio(
    audioFile: Blob | File,
    provider: LLMProvider,
    model: LLMModel,
    onProgress?: (status: string, progress: number) => void
): Promise<{ text: string; success: boolean; error?: string }> {
    try {
        onProgress?.('Preparing your file...', 10);
        await new Promise(r => setTimeout(r, 500)); // Small delay for UX

        const formData = new FormData();
        const fileName = audioFile instanceof File
            ? audioFile.name
            : `audio_${Date.now()}.webm`;

        formData.append('file', audioFile, fileName);
        formData.append('model', model.modelId);
        formData.append('response_format', 'text');

        onProgress?.('Uploading to cloud...', 30);
        await new Promise(r => setTimeout(r, 300));

        const baseUrl = provider.baseUrl.replace(/\/+$/, '');

        onProgress?.(`Transcribing with ${model.displayName}...`, 60);

        const response = await fetch(`${baseUrl}/audio/transcriptions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${provider.apiKey}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.text();
            let errorMessage = `Transcription failed (${response.status})`;
            try {
                const parsed = JSON.parse(errorData);
                errorMessage = parsed.error?.message || parsed.message || errorMessage;
            } catch (error) {
                logger.debug('Failed to parse transcription error response:', error);
                if (errorData) errorMessage = errorData;
            }
            throw new Error(errorMessage);
        }

        onProgress?.('Processing results...', 90);
        await new Promise(r => setTimeout(r, 200));

        const transcription = await response.text();

        onProgress?.('Complete!', 100);

        return {
            text: transcription.trim(),
            success: true,
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return {
            text: '',
            success: false,
            error: errorMessage,
        };
    }
}

// Animated wave component for audio visualization effect
function AudioWave({ isActive }: { isActive: boolean }) {
    return (
        <div className="flex items-center gap-0.5 h-8">
            {[...Array(5)].map((_, i) => (
                <div
                    key={i}
                    className={cn(
                        "w-1 bg-gradient-to-t from-violet-500 to-purple-400 rounded-full transition-all",
                        isActive ? "animate-pulse" : "h-2"
                    )}
                    style={{
                        height: isActive ? `${Math.random() * 24 + 8}px` : '8px',
                        animationDelay: `${i * 100}ms`,
                        animationDuration: '500ms',
                    }}
                />
            ))}
        </div>
    );
}

// Feature card component
function FeatureCard({ icon: Icon, title, description, gradient }: {
    icon: typeof Video;
    title: string;
    description: string;
    gradient: string;
}) {
    return (
        <div className="group relative p-4 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1">
            <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-transform duration-300 group-hover:scale-110",
                gradient
            )}>
                <Icon className="h-5 w-5 text-white" />
            </div>
            <h3 className="font-semibold text-sm mb-1">{title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>
    );
}

function TranscribeVideo() {
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [config, , isLoaded] = useConfig<APIConfig>(defaultConfig);

    // State
    const [file, setFile] = useState<File | null>(null);
    const [transcription, setTranscription] = useState('');
    const [state, setState] = useState<TranscriptionState>('idle');
    const [statusMessage, setStatusMessage] = useState('');
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [showResult, setShowResult] = useState(false);

    // Selected audio model state
    const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
    const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

    // Get audio models from config (with safe default)
    const audioModels = useMemo(() => {
        if (!isLoaded || !config) return [];
        return getAudioModels(config);
    }, [config, isLoaded]);

    // Get selected provider and model
    const selectedProvider = useMemo(() => {
        if (!isLoaded || !config?.providers) return null;
        if (!selectedProviderId) return audioModels[0]?.provider || null;
        return config.providers.find(p => p.id === selectedProviderId) || null;
    }, [config?.providers, selectedProviderId, audioModels, isLoaded]);

    const selectedModel = useMemo(() => {
        if (!selectedProvider) return audioModels[0]?.model || null;
        if (!selectedModelId) {
            return selectedProvider.models.find(m => m.modelCategory === 'audio') || null;
        }
        return selectedProvider.models.find(m => m.id === selectedModelId) || null;
    }, [selectedProvider, selectedModelId, audioModels]);

    // Animate result appearance
    useEffect(() => {
        if (transcription && state === 'done') {
            const timer = setTimeout(() => setShowResult(true), 100);
            return () => clearTimeout(timer);
        }
        setShowResult(false);
    }, [transcription, state]);

    // File validation
    const validateFile = (file: File): string | null => {
        const isVideo = SUPPORTED_VIDEO_TYPES.includes(file.type);
        const isAudio = SUPPORTED_AUDIO_TYPES.includes(file.type);

        if (!isVideo && !isAudio) {
            return `Unsupported file type. Please upload a video or audio file.`;
        }

        if (file.size > MAX_FILE_SIZE) {
            return `File too large. Maximum size is 100MB.`;
        }

        return null;
    };

    // Handle file selection
    const handleFileSelect = useCallback((selectedFile: File) => {
        const validationError = validateFile(selectedFile);
        if (validationError) {
            setError(validationError);
            toast.error(validationError);
            return;
        }

        setFile(selectedFile);
        setError('');
        setTranscription('');
        setState('idle');
        setProgress(0);
        toast.success(`File ready: ${selectedFile.name}`);
    }, []);

    // File input change handler
    const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            handleFileSelect(selectedFile);
        }
    };

    // Drag and drop handlers
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) {
            handleFileSelect(droppedFile);
        }
    };

    // Handle model selection
    const handleSelectModel = (providerId: string, modelId: string) => {
        setSelectedProviderId(providerId);
        setSelectedModelId(modelId);
        const provider = config?.providers?.find(p => p.id === providerId);
        const model = provider?.models.find(m => m.id === modelId);
        if (provider && model) {
            toast.success(`Using ${model.displayName}`);
        }
    };

    // Remove selected file
    const handleRemoveFile = () => {
        setFile(null);
        setError('');
        setTranscription('');
        setState('idle');
        setProgress(0);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Start transcription
    const handleTranscribe = async () => {
        if (!file) {
            toast.error('Please select a file first');
            return;
        }

        if (!selectedProvider || !selectedModel) {
            toast.error('Please select an audio model first');
            return;
        }

        if (!selectedProvider.apiKey) {
            toast.error(`No API key for ${selectedProvider.name}. Configure in Settings.`);
            return;
        }

        setError('');
        setTranscription('');
        setState('uploading');
        setProgress(0);

        try {
            const result = await transcribeAudio(file, selectedProvider, selectedModel, (status, prog) => {
                setStatusMessage(status);
                setProgress(prog);
                if (prog < 30) setState('uploading');
                else if (prog < 90) setState('transcribing');
                else setState('processing');
            });

            if (result.success) {
                setTranscription(result.text);
                setState('done');
                toast.success('Transcription complete!');
            } else {
                setError(result.error || 'Transcription failed');
                setState('error');
                toast.error(result.error || 'Transcription failed');
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            setError(errorMsg);
            setState('error');
            toast.error(errorMsg);
        }
    };

    // Copy to clipboard
    const handleCopy = async () => {
        if (!transcription) return;

        try {
            await navigator.clipboard.writeText(transcription);
            setCopied(true);
            toast.success('Copied to clipboard!');
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            logger.debug('Failed to copy transcription:', error);
            toast.error('Failed to copy');
        }
    };

    // Reset everything
    const handleReset = () => {
        setFile(null);
        setTranscription('');
        setState('idle');
        setStatusMessage('');
        setProgress(0);
        setError('');
        setShowResult(false);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const isProcessing = ['uploading', 'processing', 'transcribing'].includes(state);
    const isVideoFile = file?.type.startsWith('video/');
    const hasAudioModels = audioModels.length > 0;

    // Format file size
    const formatSize = (bytes: number) => {
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    // Show loading state while config loads
    if (!isLoaded) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center animate-pulse">
                            <Mic className="h-8 w-8 text-white" />
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-r from-green-400 to-emerald-500 flex items-center justify-center">
                            <Loader2 className="h-3 w-3 text-white animate-spin" />
                        </div>
                    </div>
                    <p className="text-sm text-muted-foreground animate-pulse">Loading transcription...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background overflow-hidden">
            {/* Animated Background */}
            <div className="fixed inset-0 -z-10 overflow-hidden">
                {/* Gradient orbs */}
                <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-violet-500/20 via-purple-500/10 to-transparent blur-3xl animate-pulse" />
                <div className="absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-gradient-to-tr from-blue-500/20 via-cyan-500/10 to-transparent blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 h-[400px] w-[400px] rounded-full bg-gradient-to-r from-fuchsia-500/10 via-pink-500/5 to-transparent blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />

                {/* Grid pattern */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]" />
            </div>

            {/* Header */}
            <header className="sticky top-0 z-20 bg-background/60 backdrop-blur-xl border-b border-border/50">
                <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate('/')}
                            className="rounded-xl hover:bg-accent/80 transition-all hover:scale-105"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25">
                                    <Mic className="h-5 w-5 text-white" />
                                </div>
                                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-background" />
                            </div>
                            <div>
                                <h1 className="text-lg font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">Transcribe</h1>
                                <p className="text-[10px] text-muted-foreground font-medium tracking-wide uppercase">AI-Powered</p>
                            </div>
                        </div>
                    </div>

                    {hasAudioModels && selectedModel && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="rounded-xl gap-2 border-border/50 hover:border-violet-500/50 transition-colors">
                                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                    <span className="text-xs font-medium max-w-[120px] truncate">{selectedModel.displayName}</span>
                                    <ChevronDown className="h-3 w-3 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-64">
                                <DropdownMenuLabel className="text-xs text-muted-foreground">
                                    Select Audio Model
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {audioModels.map(({ provider, model }) => (
                                    <DropdownMenuItem
                                        key={`${provider.id}-${model.id}`}
                                        onClick={() => handleSelectModel(provider.id, model.id)}
                                        className="cursor-pointer"
                                    >
                                        <div className="flex items-center gap-3 w-full">
                                            <div className="p-1.5 rounded-lg bg-violet-500/10">
                                                <Mic className="h-3 w-3 text-violet-500" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm truncate">{model.displayName}</div>
                                                <div className="text-xs text-muted-foreground truncate">{provider.name}</div>
                                            </div>
                                            {selectedModelId === model.id && (
                                                <Check className="h-4 w-4 text-green-500" />
                                            )}
                                        </div>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-5xl mx-auto px-4 py-8">
                {/* No Audio Models Warning */}
                {!hasAudioModels && (
                    <div className="mb-8 animate-in fade-in-0 slide-in-from-top-4 duration-500">
                        <Alert className="border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-orange-500/10 backdrop-blur-sm">
                            <AlertCircle className="h-5 w-5 text-amber-500" />
                            <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div>
                                    <p className="font-medium text-foreground">No audio models configured</p>
                                    <p className="text-sm text-muted-foreground">Add an audio model in Settings to start transcribing</p>
                                </div>
                                <Button variant="outline" size="sm" asChild className="shrink-0 gap-2 hover:bg-amber-500/10 hover:border-amber-500/50 transition-colors">
                                    <Link to="/settings">
                                        <Settings className="h-4 w-4" />
                                        Configure
                                    </Link>
                                </Button>
                            </AlertDescription>
                        </Alert>
                    </div>
                )}

                <div className="grid lg:grid-cols-5 gap-6">
                    {/* Left Column - Upload & Controls */}
                    <div className="lg:col-span-3 space-y-6">
                        {/* Upload Card */}
                        <Card className="border-border/50 bg-card/30 backdrop-blur-xl overflow-hidden shadow-xl shadow-black/5 animate-in fade-in-0 slide-in-from-left-4 duration-500">
                            <CardContent className="p-6">
                                {/* Drop Zone */}
                                <div
                                    className={cn(
                                        "relative border-2 border-dashed rounded-2xl transition-all duration-500 cursor-pointer overflow-hidden",
                                        "hover:border-violet-500/50 hover:bg-violet-500/5",
                                        isDragging && "border-violet-500 bg-violet-500/10 scale-[1.02] shadow-2xl shadow-violet-500/20",
                                        file && !isProcessing && "border-green-500/50 bg-green-500/5",
                                        isProcessing && "border-violet-500/50 bg-violet-500/5 pointer-events-none",
                                        !file && !isDragging && "border-border/50"
                                    )}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    onClick={() => !isProcessing && !file && fileInputRef.current?.click()}
                                >
                                    <Input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="video/*,audio/*"
                                        onChange={onFileInputChange}
                                        className="hidden"
                                        disabled={isProcessing}
                                    />

                                    <div className="p-8 md:p-12">
                                        {file ? (
                                            <div className="space-y-6">
                                                {/* File Info */}
                                                <div className="flex items-start gap-4">
                                                    <div className={cn(
                                                        "p-4 rounded-2xl transition-all shrink-0",
                                                        isVideoFile
                                                            ? "bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/30"
                                                            : "bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg shadow-blue-500/30"
                                                    )}>
                                                        {isVideoFile ? (
                                                            <Video className="h-8 w-8 text-white" />
                                                        ) : (
                                                            <Music className="h-8 w-8 text-white" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-semibold text-lg truncate">{file.name}</p>
                                                        <div className="flex items-center gap-3 mt-1.5 text-sm text-muted-foreground">
                                                            <span className="flex items-center gap-1.5">
                                                                <FileText className="h-3.5 w-3.5" />
                                                                {formatSize(file.size)}
                                                            </span>
                                                            <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                                                            <span className="uppercase text-xs tracking-wide">
                                                                {file.type.split('/')[1]}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {!isProcessing && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={(e) => { e.stopPropagation(); handleRemoveFile(); }}
                                                            className="rounded-xl hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
                                                        >
                                                            <X className="h-5 w-5" />
                                                        </Button>
                                                    )}
                                                </div>

                                                {/* Processing State */}
                                                {isProcessing && (
                                                    <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-3">
                                                                <div className="relative">
                                                                    <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
                                                                        <Wand2 className="h-5 w-5 text-violet-500 animate-pulse" />
                                                                    </div>
                                                                    <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-violet-500 animate-ping" />
                                                                </div>
                                                                <div>
                                                                    <p className="font-medium text-sm">{statusMessage}</p>
                                                                    <p className="text-xs text-muted-foreground">{progress}% complete</p>
                                                                </div>
                                                            </div>
                                                            <AudioWave isActive={state === 'transcribing'} />
                                                        </div>
                                                        <div className="relative h-2 bg-muted/30 rounded-full overflow-hidden">
                                                            <div
                                                                className="absolute inset-y-0 left-0 bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-all duration-500 ease-out"
                                                                style={{ width: `${progress}%` }}
                                                            />
                                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center gap-6 text-center">
                                                <div className="relative">
                                                    <div className={cn(
                                                        "p-6 rounded-3xl transition-all duration-300",
                                                        isDragging
                                                            ? "bg-gradient-to-br from-violet-500 to-purple-600 shadow-2xl shadow-violet-500/40 scale-110"
                                                            : "bg-gradient-to-br from-violet-500/20 to-purple-500/20"
                                                    )}>
                                                        <Upload className={cn(
                                                            "h-12 w-12 transition-colors duration-300",
                                                            isDragging ? "text-white" : "text-violet-500"
                                                        )} />
                                                    </div>
                                                    {isDragging && (
                                                        <div className="absolute inset-0 rounded-3xl animate-ping bg-violet-500/30" />
                                                    )}
                                                </div>

                                                <div className="space-y-2">
                                                    <p className="font-semibold text-xl">
                                                        {isDragging ? "Drop it here!" : "Drop your file here"}
                                                    </p>
                                                    <p className="text-sm text-muted-foreground">
                                                        or click to browse from your device
                                                    </p>
                                                </div>

                                                <div className="flex flex-wrap justify-center gap-2">
                                                    {['MP4', 'WebM', 'MP3', 'WAV', 'OGG', 'FLAC'].map((format) => (
                                                        <span
                                                            key={format}
                                                            className="px-3 py-1 text-xs font-medium rounded-full bg-muted/50 text-muted-foreground border border-border/50"
                                                        >
                                                            {format}
                                                        </span>
                                                    ))}
                                                </div>

                                                <p className="text-xs text-muted-foreground">
                                                    Maximum file size: 100MB
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Error Alert */}
                                {error && (
                                    <Alert variant="destructive" className="mt-4 animate-in fade-in-0 slide-in-from-top-2 duration-300">
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertDescription>{error}</AlertDescription>
                                    </Alert>
                                )}

                                {/* Action Button */}
                                {file && !transcription && (
                                    <div className="mt-6 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                                        <Button
                                            onClick={handleTranscribe}
                                            disabled={!file || !hasAudioModels || !selectedModel || isProcessing}
                                            size="lg"
                                            className={cn(
                                                "w-full h-14 rounded-xl font-semibold text-base gap-3 transition-all duration-300",
                                                "bg-gradient-to-r from-violet-600 via-purple-600 to-violet-600 bg-[length:200%_auto]",
                                                "hover:bg-[position:right_center] hover:shadow-xl hover:shadow-violet-500/30",
                                                "active:scale-[0.98]",
                                                isProcessing && "animate-pulse"
                                            )}
                                        >
                                            {isProcessing ? (
                                                <>
                                                    <Loader2 className="h-5 w-5 animate-spin" />
                                                    Transcribing...
                                                </>
                                            ) : (
                                                <>
                                                    <Sparkles className="h-5 w-5" />
                                                    Start Transcription
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Transcription Result */}
                        {transcription && (
                            <Card className={cn(
                                "border-border/50 bg-card/30 backdrop-blur-xl overflow-hidden shadow-xl shadow-black/5 transition-all duration-700",
                                showResult ? "animate-in fade-in-0 slide-in-from-bottom-8 duration-700" : "opacity-0 translate-y-8"
                            )}>
                                <CardHeader className="pb-3 border-b border-border/50">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2.5 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/25">
                                                <FileText className="h-5 w-5 text-white" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-base">Transcription Result</CardTitle>
                                                <CardDescription className="flex items-center gap-2 mt-0.5">
                                                    <Clock className="h-3 w-3" />
                                                    {transcription.split(/\s+/).length} words • {transcription.length} characters
                                                </CardDescription>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleCopy}
                                                className={cn(
                                                    "gap-2 rounded-xl transition-all duration-300",
                                                    copied && "bg-green-500/10 border-green-500/50 text-green-500"
                                                )}
                                            >
                                                {copied ? (
                                                    <>
                                                        <Check className="h-4 w-4" />
                                                        Copied!
                                                    </>
                                                ) : (
                                                    <>
                                                        <Copy className="h-4 w-4" />
                                                        Copy
                                                    </>
                                                )}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleReset}
                                                className="gap-2 rounded-xl hover:bg-destructive/10 hover:text-destructive"
                                            >
                                                <RefreshCw className="h-4 w-4" />
                                                New
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="relative group">
                                        <Textarea
                                            value={transcription}
                                            readOnly
                                            className="min-h-[250px] resize-none bg-transparent border-0 rounded-none p-6 font-medium text-base leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0"
                                        />
                                        <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="text-xs text-muted-foreground bg-background/80 backdrop-blur-sm px-2 py-1 rounded-md">
                                                Read-only
                                            </span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* Right Column - Info & Features */}
                    <div className="lg:col-span-2 space-y-6 animate-in fade-in-0 slide-in-from-right-4 duration-500 delay-150">
                        {/* Quick Stats */}
                        {hasAudioModels && selectedModel && (
                            <Card className="border-border/50 bg-card/30 backdrop-blur-xl overflow-hidden">
                                <CardContent className="p-5">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20">
                                            <Zap className="h-6 w-6 text-violet-500" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active Model</p>
                                            <p className="font-semibold">{selectedModel.displayName}</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Features Grid */}
                        <div className="grid grid-cols-2 gap-3">
                            <FeatureCard
                                icon={Upload}
                                title="Easy Upload"
                                description="Drag & drop or click to upload video and audio files up to 100MB"
                                gradient="bg-gradient-to-br from-violet-500 to-purple-600"
                            />
                            <FeatureCard
                                icon={Wand2}
                                title="AI Powered"
                                description="State-of-the-art speech recognition for accurate results"
                                gradient="bg-gradient-to-br from-blue-500 to-cyan-600"
                            />
                            <FeatureCard
                                icon={FileText}
                                title="Multiple Formats"
                                description="Support for MP4, WebM, MP3, WAV, OGG, and more"
                                gradient="bg-gradient-to-br from-green-500 to-emerald-600"
                            />
                            <FeatureCard
                                icon={Copy}
                                title="One-Click Copy"
                                description="Instantly copy your transcription to clipboard"
                                gradient="bg-gradient-to-br from-orange-500 to-amber-600"
                            />
                        </div>

                        {/* How it works */}
                        <Card className="border-border/50 bg-card/30 backdrop-blur-xl overflow-hidden">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                    <Play className="h-4 w-4 text-violet-500" />
                                    How it works
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0">
                                <div className="space-y-4">
                                    {[
                                        { step: '1', title: 'Upload', desc: 'Drop your video or audio file' },
                                        { step: '2', title: 'Process', desc: 'AI extracts and transcribes speech' },
                                        { step: '3', title: 'Copy', desc: 'Get your text instantly' },
                                    ].map((item, i) => (
                                        <div key={i} className="flex items-center gap-4">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center shrink-0">
                                                <span className="text-sm font-bold text-violet-500">{item.step}</span>
                                            </div>
                                            <div>
                                                <p className="font-medium text-sm">{item.title}</p>
                                                <p className="text-xs text-muted-foreground">{item.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </main>

            {/* Add shimmer animation keyframes via style tag */}
            <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
        </div>
    );
}

export default TranscribeVideo;
