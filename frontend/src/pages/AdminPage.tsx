import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiService } from "@/services/api";

export const AdminPage = () => {
  const { toast } = useToast();
  const [stats, setStats] = useState<{availableFunds:string; totalPayouts:string; totalWithdrawn:string; contractBalance:string} | null>(null);
  const [depositAvax, setDepositAvax] = useState("0.1");
  const [reviewer, setReviewer] = useState("");
  const [oracle, setOracle] = useState("");
  const [autoApprove, setAutoApprove] = useState(20);
  const [autoReject, setAutoReject] = useState(80);
  const [loading, setLoading] = useState({stats:false, deposit:false, add:false, remove:false, oracle:false, thresholds:false});

  const loadStats = async () => {
    try {
      setLoading(prev => ({...prev, stats:true}));
      const res = await apiService.adminPayoutStats();
      setStats(res.stats);
    } catch (e:any) {
      toast({ title: "Failed to load stats", description: e.message, variant: "destructive" });
    } finally {
      setLoading(prev => ({...prev, stats:false}));
    }
  };

  useEffect(() => { loadStats(); }, []);

  const doDeposit = async () => {
    try {
      setLoading(prev => ({...prev, deposit:true}));
      const res = await apiService.adminDeposit(depositAvax);
      toast({ title: "Deposited", description: `Tx: ${res.transactionHash}` });
      await loadStats();
    } catch (e:any) {
      toast({ title: "Deposit failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(prev => ({...prev, deposit:false}));
    }
  };

  const addReviewer = async () => {
    try {
      setLoading(prev => ({...prev, add:true}));
      const res = await apiService.adminAddReviewer(reviewer);
      toast({ title: "Reviewer added", description: `Tx: ${res.transactionHash}` });
    } catch (e:any) {
      toast({ title: "Add reviewer failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(prev => ({...prev, add:false}));
    }
  };

  const removeReviewer = async () => {
    try {
      setLoading(prev => ({...prev, remove:true}));
      const res = await apiService.adminRemoveReviewer(reviewer);
      toast({ title: "Reviewer removed", description: `Tx: ${res.transactionHash}` });
    } catch (e:any) {
      toast({ title: "Remove reviewer failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(prev => ({...prev, remove:false}));
    }
  };

  const setOracleAddr = async () => {
    try {
      setLoading(prev => ({...prev, oracle:true}));
      const res = await apiService.adminSetOracle(oracle);
      toast({ title: "Oracle set", description: `Tx: ${res.transactionHash}` });
    } catch (e:any) {
      toast({ title: "Set oracle failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(prev => ({...prev, oracle:false}));
    }
  };

  const setThresholds = async () => {
    try {
      setLoading(prev => ({...prev, thresholds:true}));
      const res = await apiService.adminSetThresholds(autoApprove, autoReject);
      toast({ title: "Thresholds set", description: `Tx: ${res.transactionHash}` });
    } catch (e:any) {
      toast({ title: "Set thresholds failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(prev => ({...prev, thresholds:false}));
    }
  };

  const fmt = (v?:string) => v ? v : "0";

  return (
    <div className="container px-4 pt-28 pb-12 max-w-3xl">
      <div className="space-y-8">
        <Card className="glass">
          <CardHeader>
            <CardTitle>Admin Panel</CardTitle>
            <CardDescription>Utilities to mirror test-e2e.js actions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Available Funds</div>
                <div className="text-xl font-semibold">{fmt(stats?.availableFunds)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Contract Balance</div>
                <div className="text-xl font-semibold">{fmt(stats?.contractBalance)}</div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div>
                <div className="text-sm text-muted-foreground">Total Payouts</div>
                <Badge variant="secondary">{fmt(stats?.totalPayouts)}</Badge>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Withdrawn</div>
                <Badge variant="secondary">{fmt(stats?.totalWithdrawn)}</Badge>
              </div>
              <Button variant="outline" onClick={loadStats} disabled={loading.stats}>Refresh</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle>Deposit to PayoutManager</CardTitle>
            <CardDescription>Deposit AVAX from backend signer</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="deposit">Amount (AVAX)</Label>
              <Input id="deposit" value={depositAvax} onChange={(e)=>setDepositAvax(e.target.value)} />
            </div>
            <Button className="button-gradient" onClick={doDeposit} disabled={loading.deposit}>
              {loading.deposit ? 'Depositing...' : 'Deposit'}
            </Button>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle>Reviewers</CardTitle>
            <CardDescription>Add or remove reviewer address</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rev">Reviewer Address</Label>
              <Input id="rev" placeholder="0x..." value={reviewer} onChange={(e)=>setReviewer(e.target.value)} />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={addReviewer} disabled={loading.add}>Add Reviewer</Button>
              <Button variant="outline" onClick={removeReviewer} disabled={loading.remove}>Remove Reviewer</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle>AI Oracle</CardTitle>
            <CardDescription>Set backend AI oracle address</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="oracle">Oracle Address</Label>
              <Input id="oracle" placeholder="0x..." value={oracle} onChange={(e)=>setOracle(e.target.value)} />
            </div>
            <Button variant="outline" onClick={setOracleAddr} disabled={loading.oracle}>Set Oracle</Button>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle>AI Thresholds</CardTitle>
            <CardDescription>Set auto-approve and auto-reject fraud risk thresholds</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="approve">Auto-Approve (&lt;=)</Label>
                <Input id="approve" type="number" value={autoApprove} onChange={(e)=>setAutoApprove(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reject">Auto-Reject (&gt;=)</Label>
                <Input id="reject" type="number" value={autoReject} onChange={(e)=>setAutoReject(Number(e.target.value))} />
              </div>
            </div>
            <Button variant="outline" onClick={setThresholds} disabled={loading.thresholds}>Set Thresholds</Button>
          </CardContent>
        </Card>

        <Separator />
        <div className="text-sm text-muted-foreground">Tip: Use Create Policy at /admin/create-policy to seed policies for a wallet.</div>
      </div>
    </div>
  );
};
