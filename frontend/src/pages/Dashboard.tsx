import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shield, FileText, Plus, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiService, Policy, Claim } from '@/services/api';
import { Link } from 'react-router-dom';

interface DashboardProps {
  userAddress: string;
}

export const Dashboard = ({ userAddress }: DashboardProps) => {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchUserData = async () => {
    try {
      setLoading(true);
      
      // Fetch user's policies
      const policiesResponse = await apiService.getUserPolicies(userAddress);
      const policyPromises = policiesResponse.policyIds.map(id => apiService.getPolicy(id));
      const policyResults = await Promise.all(policyPromises);
      setPolicies(policyResults.map(result => result.policy));

      // Fetch user's claims
      const claimsResponse = await apiService.getUserClaims(userAddress);
      const claimPromises = claimsResponse.claimIds.map(id => apiService.getClaim(id));
      const claimResults = await Promise.all(claimPromises);
      setClaims(claimResults.map(result => result.claim));
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load dashboard data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userAddress) {
      fetchUserData();
    }
  }, [userAddress]);

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

  if (loading) {
    return (
      <div className="container px-4 py-8">
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="glass">
                <CardHeader className="space-y-2">
                  <div className="h-4 bg-muted rounded animate-pulse" />
                  <div className="h-3 bg-muted rounded w-2/3 animate-pulse" />
                </CardHeader>
                <CardContent>
                  <div className="h-16 bg-muted rounded animate-pulse" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Insurance Dashboard</h1>
            <p className="text-muted-foreground">
              Manage your policies and claims on Avalanche
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/file-claim">
              <Button className="button-gradient">
                <Plus className="w-4 h-4 mr-2" />
                File Claim
              </Button>
            </Link>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="glass">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Active Policies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {policies.filter(p => p.isActive).length}
              </div>
            </CardContent>
          </Card>
          <Card className="glass">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Claims</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{claims.length}</div>
            </CardContent>
          </Card>
          <Card className="glass">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Approved Claims</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">
                {claims.filter(c => c.status === 'Approved' || c.status === 'Paid').length}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Policies Section */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  Your Policies
                </CardTitle>
                <CardDescription>
                  {policies.length === 0 ? 'No policies found' : `${policies.length} policies`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {policies.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Shield className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No policies found</p>
                    <p className="text-sm">Contact admin to get policies created</p>
                  </div>
                ) : (
                  policies.slice(0, 3).map((policy) => (
                    <Link key={policy.id} to={`/policy/${policy.id}`}>
                      <div className="flex items-center justify-between p-3 rounded-lg glass-hover cursor-pointer">
                        <div>
                          <h4 className="font-medium">Policy #{policy.id}</h4>
                          <p className="text-sm text-muted-foreground">
                            Coverage: ${parseInt(policy.coverage).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge variant={policy.isActive ? "default" : "secondary"}>
                            {policy.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Claims Section */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Recent Claims
                </CardTitle>
                <CardDescription>
                  {claims.length === 0 ? 'No claims filed' : `${claims.length} claims`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {claims.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No claims filed yet</p>
                    <Link to="/file-claim">
                      <Button variant="outline" className="mt-2">
                        File Your First Claim
                      </Button>
                    </Link>
                  </div>
                ) : (
                  claims.slice(0, 3).map((claim) => (
                    <Link key={claim.id} to={`/claim/${claim.id}`}>
                      <div className="flex items-center justify-between p-3 rounded-lg glass-hover cursor-pointer">
                        <div>
                          <h4 className="font-medium">Claim #{claim.id}</h4>
                          <p className="text-sm text-muted-foreground">
                            Policy #{claim.policyId}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge className={getStatusColor(claim.status)}>
                            {claim.status}
                          </Badge>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};