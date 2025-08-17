import { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import { Dashboard } from "./pages/Dashboard";
import { FileClaimPage } from "./pages/FileClaimPage";
import { ClaimDetailPage } from "./pages/ClaimDetailPage";
import { CreatePolicyPage } from "./pages/CreatePolicyPage";
import { AdminPage } from "./pages/AdminPage";
import { WalletConnect } from "./components/wallet/WalletConnect";
import Navigation from "./components/Navigation";
import { apiService } from "./services/api";

const queryClient = new QueryClient();

const App = () => {
  const [userAddress, setUserAddress] = useState<string>('');
  const [userPolicies, setUserPolicies] = useState<string[]>([]);

  const handleWalletConnect = async (address: string) => {
    setUserAddress(address);
    try {
      const res = await apiService.getUserPolicies(address);
      setUserPolicies(res.policyIds || []);
    } catch (e) {
      // Fallback to empty policies list on failure
      setUserPolicies([]);
    }
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-background">
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <div className="min-h-screen bg-black text-foreground">
              <div className="relative">
                {/* Wallet Connect - Fixed position */}
                <div className="fixed top-4 right-4 z-50">
                  <WalletConnect onConnect={handleWalletConnect} />
                </div>
                
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route 
                    path="/dashboard" 
                    element={
                      userAddress ? (
                        <Dashboard userAddress={userAddress} />
                      ) : (
                        <div className="flex items-center justify-center min-h-screen">
                          <div className="text-center">
                            <h2 className="text-2xl font-bold mb-4">Connect Your Wallet</h2>
                            <p className="text-muted-foreground">Please connect your wallet to access the dashboard</p>
                          </div>
                        </div>
                      )
                    } 
                  />
                  <Route 
                    path="/file-claim" 
                    element={
                      userAddress ? (
                        <FileClaimPage userAddress={userAddress} userPolicies={userPolicies} />
                      ) : (
                        <div className="flex items-center justify-center min-h-screen">
                          <div className="text-center">
                            <h2 className="text-2xl font-bold mb-4">Connect Your Wallet</h2>
                            <p className="text-muted-foreground">Please connect your wallet to file a claim</p>
                          </div>
                        </div>
                      )
                    } 
                  />
                  <Route 
                    path="/claim/:claimId" 
                    element={
                      userAddress ? (
                        <ClaimDetailPage userAddress={userAddress} />
                      ) : (
                        <div className="flex items-center justify-center min-h-screen">
                          <div className="text-center">
                            <h2 className="text-2xl font-bold mb-4">Connect Your Wallet</h2>
                            <p className="text-muted-foreground">Please connect your wallet to view claim details</p>
                          </div>
                        </div>
                      )
                    } 
                  />
                  <Route 
                    path="/admin/create-policy" 
                    element={<CreatePolicyPage />} 
                  />
                  <Route 
                    path="/admin" 
                    element={<AdminPage />} 
                  />
                </Routes>
              </div>
            </div>
          </BrowserRouter>
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;