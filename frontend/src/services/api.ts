const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:3001';

export interface Policy {
  id: string;
  holder: string;
  premium: string;
  coverage: string;
  deductible: string;
  policyType: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

export interface PublicConfig {
  success: boolean;
  chain: {
    rpcUrl: string;
    chainId: number;
  };
  contracts: {
    policyRegistry: string;
    claimsProcessor: string;
    payoutManager: string;
  };
}

export interface AIAnalysis {
  claimType: number;
  severity: number;
  fraudRisk: number;
  recommendedPayout: string;
  reasoning?: string;
  confidence?: number;
}

export interface Claim {
  id: string;
  policyId: string;
  claimant: string;
  description: string;
  evidenceHashes: string[];
  evidenceUrls: string[];
  timestamp: string;
  status: 'Submitted' | 'AIAnalyzed' | 'UnderReview' | 'Approved' | 'Rejected' | 'Paid';
  statusCode: number;
  assignedReviewer?: string;
  finalPayout?: string;
  aiAnalysis?: AIAnalysis;
}

export interface EvidenceFile {
  cid: string;
  url: string;
}

class ApiService {
  private inFlight = new Map<string, Promise<any>>();

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${BACKEND_URL}${endpoint}`;
    const method = (options?.method || 'GET').toUpperCase();

    // De-duplicate concurrent GETs to the same URL
    const key = method === 'GET' ? url : '';
    if (key && this.inFlight.has(key)) {
      return this.inFlight.get(key)! as Promise<T>;
    }

    const fetchPromise = fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    })
      .then(async (response) => {
        if (!response.ok) {
          const error = await response.text();
          throw new Error(error || `HTTP ${response.status}`);
        }
        return response.json();
      })
      .finally(() => {
        if (key) this.inFlight.delete(key);
      });

    if (key) this.inFlight.set(key, fetchPromise);
    return fetchPromise as Promise<T>;
  }

  async uploadEvidence(files: File[]): Promise<{ files: EvidenceFile[] }> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    const response = await fetch(`${BACKEND_URL}/api/evidence/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to upload evidence');
    }

    return response.json();
  }

  async getEvidenceUrl(cid: string): Promise<{ url: string }> {
    return this.request(`/api/evidence/${cid}`);
  }

  async submitClaim(data: {
    policyId: string;
    description: string;
    evidenceHashes: string[];
    userAddress: string;
  }): Promise<{ success: boolean; claimId: string; transactionHash: string }> {
    return this.request('/api/claims/submit', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async analyzeClaim(claimId: string): Promise<{
    success: boolean;
    claimId: string;
    analysis: AIAnalysis;
    transactionHash: string;
  }> {
    return this.request(`/api/claims/${claimId}/analyze`, {
      method: 'POST',
    });
  }

  async getClaim(claimId: string): Promise<{ success: boolean; claim: Claim }> {
    return this.request(`/api/claims/${claimId}`);
  }

  async getPolicy(policyId: string): Promise<{ success: boolean; policy: Policy }> {
    return this.request(`/api/policies/${policyId}`);
  }

  async getUserPolicies(address: string): Promise<{ policyIds: string[] }> {
    return this.request(`/api/users/${address}/policies`);
  }

  async getUserClaims(address: string): Promise<{ claimIds: string[] }> {
    return this.request(`/api/users/${address}/claims`);
  }

  async createPolicy(data: {
    holder: string;
    premium: string | number;
    coverage: string | number;
    deductible: string | number;
    policyType: string;
    duration: number;
  }): Promise<{ success: boolean; policyId: string; transactionHash: string }> {
    return this.request('/api/policies/create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Admin: payout deposit (AVAX)
  async adminDeposit(amountAvax: string | number): Promise<{ success: boolean; transactionHash: string }> {
    return this.request('/api/admin/payout/deposit', {
      method: 'POST',
      body: JSON.stringify({ amountAvax }),
    });
  }

  // Admin: payout stats
  async adminPayoutStats(): Promise<{ success: boolean; stats: { availableFunds: string; totalPayouts: string; totalWithdrawn: string; contractBalance: string } }> {
    return this.request('/api/admin/payout/stats');
  }

  // Admin: add reviewer
  async adminAddReviewer(address: string): Promise<{ success: boolean; transactionHash: string }> {
    return this.request('/api/admin/reviewers/add', {
      method: 'POST',
      body: JSON.stringify({ address }),
    });
  }

  // Admin: remove reviewer
  async adminRemoveReviewer(address: string): Promise<{ success: boolean; transactionHash: string }> {
    return this.request('/api/admin/reviewers/remove', {
      method: 'POST',
      body: JSON.stringify({ address }),
    });
  }

  // Admin: set AI oracle
  async adminSetOracle(address: string): Promise<{ success: boolean; transactionHash: string }> {
    return this.request('/api/admin/oracle', {
      method: 'POST',
      body: JSON.stringify({ address }),
    });
  }

  // Admin: set thresholds
  async adminSetThresholds(autoApprove: number, autoReject: number): Promise<{ success: boolean; transactionHash: string }> {
    return this.request('/api/admin/thresholds', {
      method: 'POST',
      body: JSON.stringify({ autoApprove, autoReject }),
    });
  }

  async checkHealth(): Promise<{ status: string }> {
    return this.request('/api/health');
  }

  async getConfig(): Promise<PublicConfig> {
    return this.request('/api/config');
  }
}

export const apiService = new ApiService();