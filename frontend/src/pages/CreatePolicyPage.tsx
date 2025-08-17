import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiService } from "@/services/api";

export const CreatePolicyPage = () => {
  const [holder, setHolder] = useState("");
  const [premium, setPremium] = useState("1000000");
  const [coverage, setCoverage] = useState("50000000");
  const [deductible, setDeductible] = useState("1000000");
  const [policyType, setPolicyType] = useState("auto");
  const [duration, setDuration] = useState(2592000); // 30 days
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ policyId: string; tx: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiService.createPolicy({
        holder,
        premium,
        coverage,
        deductible,
        policyType,
        duration,
      });
      setResult({ policyId: res.policyId, tx: res.transactionHash });
    } catch (err: any) {
      setError(err?.message || "Failed to create policy");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-foreground">
      <div className="container px-4 pt-28 pb-16 max-w-2xl">
        <Card className="glass">
          <CardHeader>
            <CardTitle>Create Sample Policy</CardTitle>
            <CardDescription>
              Admin-only helper to seed a policy for testing. Enter a wallet address as holder.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="holder">Policy Holder Address</Label>
                <Input id="holder" placeholder="0x..." value={holder} onChange={(e) => setHolder(e.target.value)} required />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="premium">Premium (6 decimals USD)</Label>
                  <Input id="premium" type="number" value={premium} onChange={(e) => setPremium(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="coverage">Coverage (6 decimals USD)</Label>
                  <Input id="coverage" type="number" value={coverage} onChange={(e) => setCoverage(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="deductible">Deductible (6 decimals USD)</Label>
                  <Input id="deductible" type="number" value={deductible} onChange={(e) => setDeductible(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="policyType">Policy Type (string, e.g. "auto")</Label>
                  <Input id="policyType" type="text" value={policyType} onChange={(e) => setPolicyType(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (seconds)</Label>
                <Input id="duration" type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
              </div>

              {error && (
                <div className="text-red-400 text-sm">{error}</div>
              )}
              {result && (
                <div className="text-green-400 text-sm">
                  Created policy <span className="font-mono">#{result.policyId}</span>. Tx: <span className="font-mono">{result.tx}</span>
                </div>
              )}

              <div className="flex gap-3">
                <Button type="submit" className="button-gradient" disabled={loading}>
                  {loading ? "Creating..." : "Create Policy"}
                </Button>
                <a href="/dashboard" className="text-sm underline text-muted-foreground">Go to Dashboard</a>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
