import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  ArrowLeft, 
  ExternalLink, 
  FileText, 
  Image as ImageIcon, 
  Brain, 
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiService, Claim, PublicConfig } from '@/services/api';

interface ClaimDetailPageProps {
  userAddress: string;
}

export const ClaimDetailPage = ({ userAddress }: ClaimDetailPageProps) => {
  const { claimId } = useParams<{ claimId: string }>();
  const [claim, setClaim] = useState<Claim | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const { toast } = useToast();

  const fetchClaimDetails = async () => {
    if (!claimId) return;
    
    try {
      setLoading(true);
      const response = await apiService.getClaim(claimId);
      setClaim(response.claim);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load claim details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!claimId) return;
    
    try {
      setAnalyzing(true);
      
      toast({
        title: "Analysis Started",
        description: "AI is analyzing your claim...",
      });

      const response = await apiService.analyzeClaim(claimId);
      
      toast({
        title: "Analysis Complete",
        description: "AI analysis has been submitted on-chain",
      });

      if (response.transactionHash) {
        toast({
          title: "Transaction Confirmed",
          description: (
            <div className="flex items-center gap-2">
              <span>View on Snowtrace</span>
              <a 
                href={`https://testnet.snowtrace.io/tx/${response.transactionHash}`}
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          ),
        });
      }

      // Refresh claim details
      await fetchClaimDetails();
    } catch (error: any) {
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze claim",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleWithdraw = async () => {
    if (!window.ethereum) {
      toast({
        title: "Wallet Required",
        description: "Please connect your wallet to withdraw funds",
        variant: "destructive",
      });
      return;
    }

    try {
      setWithdrawing(true);
      // Ensure config is loaded
      const cfg = config || (await apiService.getConfig());
      if (!config) setConfig(cfg);
      const payoutManager = cfg.contracts.payoutManager;
      if (!payoutManager) {
        throw new Error('PayoutManager address not available');
      }
      
      // Call PayoutManager.withdraw() via wallet
      const transactionHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: userAddress,
          to: payoutManager,
          data: '0x3ccfd60b', // withdraw() function selector
        }],
      });

      toast({
        title: "Withdrawal Initiated",
        description: (
          <div className="flex items-center gap-2">
            <span>Transaction submitted</span>
            <a 
              href={`https://testnet.snowtrace.io/tx/${transactionHash}`}
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        ),
      });
    } catch (error: any) {
      toast({
        title: "Withdrawal Failed",
        description: error.message || "Failed to withdraw funds",
        variant: "destructive",
      });
    } finally {
      setWithdrawing(false);
    }
  };

  useEffect(() => {
    fetchClaimDetails();
    // Load backend public config once
    (async () => {
      try {
        const cfg = await apiService.getConfig();
        setConfig(cfg);
      } catch {}
    })();
  }, [claimId]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Paid':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'Approved':
        return <CheckCircle className="w-5 h-5 text-blue-500" />;
      case 'Rejected':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'UnderReview':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'AIAnalyzed':
        return <Brain className="w-5 h-5 text-purple-500" />;
      default:
        return <FileText className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Paid':
        return 'bg-green-500';
      case 'Approved':
        return 'bg-blue-500';
      case 'Rejected':
        return 'bg-red-500';
      case 'UnderReview':
        return 'bg-yellow-500';
      case 'AIAnalyzed':
        return 'bg-purple-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getFraudRiskLevel = (fraudRisk: number) => {
    if (fraudRisk <= 20) return { label: 'Low', color: 'text-green-500' };
    if (fraudRisk <= 50) return { label: 'Medium', color: 'text-yellow-500' };
    return { label: 'High', color: 'text-red-500' };
  };

  if (loading) {
    return (
      <div className="container px-4 py-8 max-w-4xl mx-auto">
        <div className="space-y-6">
          <div className="h-8 bg-muted rounded animate-pulse" />
          <Card className="glass">
            <CardHeader>
              <div className="h-6 bg-muted rounded animate-pulse" />
              <div className="h-4 bg-muted rounded w-2/3 animate-pulse" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-4 bg-muted rounded animate-pulse" />
              <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="container px-4 py-8 max-w-4xl mx-auto">
        <div className="text-center py-12">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <h2 className="text-xl font-semibold mb-2">Claim Not Found</h2>
          <p className="text-muted-foreground mb-4">
            The claim you're looking for doesn't exist or you don't have access to it.
          </p>
          <Link to="/dashboard">
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container px-4 py-8 max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard">
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold">Claim #{claim.id}</h1>
              <p className="text-muted-foreground">Policy #{claim.policyId}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchClaimDetails}
              disabled={loading}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Status Card */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getStatusIcon(claim.status)}
              Claim Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Badge className={getStatusColor(claim.status)}>
                {claim.status}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Filed on {new Date(claim.timestamp).toLocaleDateString()}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Claim Details */}
          <Card className="glass">
            <CardHeader>
              <CardTitle>Claim Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{claim.description}</p>
            </CardContent>
          </Card>

          {/* Evidence */}
          <Card className="glass">
            <CardHeader>
              <CardTitle>Evidence Files</CardTitle>
              <CardDescription>
                {claim.evidenceUrls.length} file(s) uploaded
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {claim.evidenceUrls.map((url, index) => (
                <div key={index} className="flex items-center gap-2 p-2 rounded glass-hover">
                  <ImageIcon className="w-4 h-4" />
                  <a 
                    href={url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    Evidence {index + 1}
                  </a>
                  <ExternalLink className="w-3 h-3" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* AI Analysis Section */}
        {claim.status === 'Submitted' && (
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-primary" />
                AI Analysis
              </CardTitle>
              <CardDescription>
                Ready to analyze your claim with AI
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={handleAnalyze} 
                disabled={analyzing}
                className="button-gradient"
              >
                {analyzing ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Brain className="w-4 h-4 mr-2" />
                    Analyze Claim
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* AI Analysis Results */}
        {claim.aiAnalysis && (
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-primary" />
                AI Analysis Results
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-sm font-medium">Claim Type</Label>
                  <p className="text-sm text-muted-foreground">Type {claim.aiAnalysis.claimType}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Severity Level</Label>
                  <p className="text-sm text-muted-foreground">{claim.aiAnalysis.severity}/10</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Fraud Risk</Label>
                  <div className="flex items-center gap-2">
                    <Progress value={claim.aiAnalysis.fraudRisk} className="flex-1" />
                    <span className={`text-sm font-medium ${getFraudRiskLevel(claim.aiAnalysis.fraudRisk).color}`}>
                      {getFraudRiskLevel(claim.aiAnalysis.fraudRisk).label}
                    </span>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Recommended Payout</Label>
                  <p className="text-sm font-medium">
                    ${(parseInt(claim.aiAnalysis.recommendedPayout) / 1000000).toLocaleString()}
                  </p>
                </div>
              </div>
              
              {claim.aiAnalysis.reasoning && (
                <div>
                  <Label className="text-sm font-medium">AI Reasoning</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {claim.aiAnalysis.reasoning}
                  </p>
                </div>
              )}

              {claim.aiAnalysis.confidence && (
                <div>
                  <Label className="text-sm font-medium">Confidence Level</Label>
                  <div className="flex items-center gap-2">
                    <Progress value={claim.aiAnalysis.confidence} className="flex-1" />
                    <span className="text-sm font-medium">{claim.aiAnalysis.confidence}%</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Payout Section */}
        {(claim.status === 'Paid' || claim.status === 'Approved') && claim.finalPayout && (
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-500" />
                Payout Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Approved Amount:</span>
                <span className="text-lg font-bold text-green-500">
                  ${(parseInt(claim.finalPayout) / 1000000).toLocaleString()}
                </span>
              </div>
              
              {claim.status === 'Paid' && (
                <Button 
                  onClick={handleWithdraw}
                  disabled={withdrawing}
                  className="w-full button-gradient"
                >
                  {withdrawing ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Withdrawing...
                    </>
                  ) : (
                    <>
                      <DollarSign className="w-4 h-4 mr-2" />
                      Withdraw AVAX
                    </>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Under Review Message */}
        {claim.status === 'UnderReview' && (
          <Card className="glass border-yellow-500/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-500">
                <Clock className="w-5 h-5" />
                Under Review
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Your claim is currently under human review. This may take 1-3 business days. 
                You'll be notified once a decision is made.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Rejected Message */}
        {claim.status === 'Rejected' && (
          <Card className="glass border-red-500/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-500">
                <AlertTriangle className="w-5 h-5" />
                Claim Rejected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Your claim has been rejected. If you believe this was an error, 
                please contact support with additional evidence.
              </p>
            </CardContent>
          </Card>
        )}
      </motion.div>
    </div>
  );
};