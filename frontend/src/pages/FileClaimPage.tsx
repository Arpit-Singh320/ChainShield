import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, X, FileText, Image as ImageIcon, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiService } from '@/services/api';
import { Link } from 'react-router-dom';

interface FileClaimPageProps {
  userAddress: string;
  userPolicies: string[];
}

export const FileClaimPage = ({ userAddress, userPolicies }: FileClaimPageProps) => {
  const [selectedPolicy, setSelectedPolicy] = useState<string>('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    const validFiles = selectedFiles.filter(file => {
      const isValidType = file.type.startsWith('image/') || file.type === 'application/pdf';
      const isValidSize = file.size <= 10 * 1024 * 1024; // 10MB limit
      
      if (!isValidType) {
        toast({
          title: "Invalid file type",
          description: `${file.name} is not a supported file type`,
          variant: "destructive",
        });
        return false;
      }
      
      if (!isValidSize) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds 10MB limit`,
          variant: "destructive",
        });
        return false;
      }
      
      return true;
    });

    setFiles(prev => [...prev, ...validFiles]);
  }, [toast]);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const droppedFiles = Array.from(event.dataTransfer.files);
    const validFiles = droppedFiles.filter(file => {
      const isValidType = file.type.startsWith('image/') || file.type === 'application/pdf';
      const isValidSize = file.size <= 10 * 1024 * 1024;
      return isValidType && isValidSize;
    });
    setFiles(prev => [...prev, ...validFiles]);
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!selectedPolicy || !description.trim()) {
      toast({
        title: "Missing Information",
        description: "Please select a policy and provide a description",
        variant: "destructive",
      });
      return;
    }

    if (files.length === 0) {
      toast({
        title: "Evidence Required",
        description: "Please upload at least one evidence file",
        variant: "destructive",
      });
      return;
    }

    try {
      setUploading(true);
      
      // Upload evidence files
      const uploadResult = await apiService.uploadEvidence(files);
      const evidenceHashes = uploadResult.files.map(file => file.cid);

      setUploading(false);
      setSubmitting(true);

      // Submit claim
      const claimResult = await apiService.submitClaim({
        policyId: selectedPolicy,
        description: description.trim(),
        evidenceHashes,
        userAddress,
      });

      toast({
        title: "Claim Submitted",
        description: `Claim #${claimResult.claimId} has been submitted successfully`,
      });

      // Show transaction link
      if (claimResult.transactionHash) {
        toast({
          title: "Transaction Confirmed",
          description: (
            <div className="flex items-center gap-2">
              <span>View on Snowtrace</span>
              <a 
                href={`https://testnet.snowtrace.io/tx/${claimResult.transactionHash}`}
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                <ArrowLeft className="w-4 h-4 transform rotate-45" />
              </a>
            </div>
          ),
        });
      }

      // Navigate to claim detail
      navigate(`/claim/${claimResult.claimId}`);
    } catch (error: any) {
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit claim",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setSubmitting(false);
    }
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <ImageIcon className="w-4 h-4" />;
    }
    return <FileText className="w-4 h-4" />;
  };

  return (
    <div className="container px-4 py-8 max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div className="flex items-center gap-4">
          <Link to="/dashboard">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">File a Claim</h1>
            <p className="text-muted-foreground">
              Submit evidence and details for your insurance claim
            </p>
          </div>
        </div>

        <Card className="glass">
          <CardHeader>
            <CardTitle>Claim Information</CardTitle>
            <CardDescription>
              Provide details about your claim and upload supporting evidence
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Policy Selection */}
              <div className="space-y-2">
                <Label htmlFor="policy">Select Policy</Label>
                <Select value={selectedPolicy} onValueChange={setSelectedPolicy}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose your policy" />
                  </SelectTrigger>
                  <SelectContent>
                    {userPolicies.map((policyId) => (
                      <SelectItem key={policyId} value={policyId}>
                        Policy #{policyId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Claim Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe what happened, when it occurred, and any relevant details..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
              </div>

              {/* File Upload */}
              <div className="space-y-2">
                <Label>Evidence Files</Label>
                <div
                  className="border-2 border-dashed border-border rounded-lg p-6 text-center glass"
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-2">
                    Drag and drop files here, or click to select
                  </p>
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="file-upload"
                  />
                  <Label htmlFor="file-upload" className="cursor-pointer">
                    <Button type="button" variant="outline" size="sm">
                      Choose Files
                    </Button>
                  </Label>
                  <p className="text-xs text-muted-foreground mt-2">
                    Supports: Images (JPG, PNG, etc.) and PDF files up to 10MB each
                  </p>
                </div>

                {/* File List */}
                {files.length > 0 && (
                  <div className="space-y-2">
                    {files.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 rounded-lg glass"
                      >
                        <div className="flex items-center gap-2">
                          {getFileIcon(file)}
                          <span className="text-sm font-medium">{file.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({(file.size / 1024 / 1024).toFixed(1)} MB)
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(index)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full button-gradient"
                disabled={uploading || submitting || !selectedPolicy || !description.trim() || files.length === 0}
              >
                {uploading && 'Uploading Evidence...'}
                {submitting && 'Submitting Claim...'}
                {!uploading && !submitting && 'Submit Claim'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};