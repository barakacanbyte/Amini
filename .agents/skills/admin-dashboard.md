# Admin Dashboard

The Amini admin dashboard provides tools for managing organization registrations, monitoring platform activity, and approving/rejecting verification requests.

## Overview

The admin dashboard is accessible at `/dashboard/admin` and includes:

1. **Statistics Overview** - Platform metrics (volume, campaigns, organizations)
2. **Pending Organization Reviews** - Approval queue with detailed organization information
3. **Organizations Management** (`/admin/organizations`) - Full list with filters and search

## Features

### Dashboard Statistics (`/dashboard/admin`)

Real-time statistics showing:
- **Total Volume**: Aggregate USDC deposited across all campaigns
- **Active Campaigns**: Number of ongoing campaigns
- **Verified Organizations**: Count of approved organizations
- **Pending Reviews**: Organizations awaiting approval

### Organization Approval Workflow

Each pending organization displays:
- Organization name, logo, and description
- Country and submission date
- Official email and contact information
- Website, Twitter, LinkedIn, ENS name
- Coinbase verification status
- Wallet address

**Actions:**
- **Approve**: Sets status to `approved`, updates profile role to `organization`, records verification timestamp
- **Reject**: Sets status to `rejected` with optional reason

### Organizations Management (`/admin/organizations`)

Comprehensive view with:
- **Filters**: All / Pending / Approved / Rejected
- **Search**: By name, wallet address, or country
- **Stats Cards**: Quick counts by status
- **Organization Cards**: Compact view with status badges

## API Endpoints

All admin endpoints require authentication via wallet address in the `x-wallet-address` header and verify admin role in the database.

### GET `/api/admin/stats`

**Response:**
```json
{
  "ok": true,
  "stats": {
    "totalVolume": "$1.2M",
    "activeCampaigns": 42,
    "verifiedOrgs": 18,
    "pendingReviews": 5
  }
}
```

### GET `/api/admin/organizations/pending`

**Response:**
```json
{
  "ok": true,
  "organizations": [
    {
      "id": "uuid",
      "wallet": "0x...",
      "name": "Organization Name",
      "description": "...",
      "country": "Kenya",
      "status": "pending",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### POST `/api/admin/organizations/[id]/approve`

**Response:**
```json
{
  "ok": true,
  "message": "Organization approved successfully",
  "organization": { }
}
```

### POST `/api/admin/organizations/[id]/reject`

**Request Body (optional):**
```json
{
  "reason": "Insufficient documentation"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Organization rejected",
  "organization": { }
}
```

## Authorization

### Database Setup

Admin access requires the wallet address to have `role = 'admin'` in the `profiles` table:

```sql
INSERT INTO public.profiles (wallet, role)
VALUES ('0xYourAdminWallet', 'admin')
ON CONFLICT (wallet)
DO UPDATE SET role = 'admin';
```

### Authentication Flow

1. User connects wallet via Coinbase Smart Wallet or CDP
2. Frontend includes wallet address in `x-wallet-address` header
3. API endpoints call `requireAdmin(req)` to verify:
   - Wallet address is provided
   - Profile exists with role = 'admin'
4. Returns 401/403 if unauthorized

### Client-Side Hook

Use `useAdminAuth()` hook for authenticated API calls:

```tsx
import { useAdminAuth } from "@/hooks/useAdminAuth";

function AdminComponent() {
  const { adminFetch, isConnected } = useAdminAuth();

  const fetchData = async () => {
    const res = await adminFetch("/api/admin/stats");
    const data = await res.json();
  };
}
```

## Security Considerations

⚠️ **Production Deployment:**

1. **Replace simple auth**: Current implementation uses wallet address in headers. For production, implement:
   - JWT tokens with signature verification
   - Session management with secure cookies
   - Rate limiting on admin endpoints

2. **Row-Level Security**: Consider adding RLS policies on `organizations` table for admin operations

3. **Audit Logging**: Track all approve/reject actions with timestamp and admin wallet

4. **Multi-signature**: For critical operations, require multiple admin approvals

5. **Environment Variables**: Keep `SUPABASE_SERVICE_ROLE_KEY` secure and never expose to client

## Testing Locally

1. Connect your wallet to the application
2. Add your wallet to the profiles table as admin (see SQL above)
3. Navigate to `/dashboard/admin`
4. Create test organizations via the regular registration flow
5. Test approve/reject workflows

## Troubleshooting

**"Access denied. Admin role required"** — Verify your wallet address has `role = 'admin'` in the `profiles` table.

**"Authentication required. Wallet address not provided"** — Ensure wallet is connected and `useAdminAuth` hook is being used.

**Stats showing $0 or 0 campaigns** — Check that Supabase tables have data and indexer is running.

**Organizations not loading** — Verify `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set correctly.

## Future Enhancements

- [ ] Bulk approval/rejection actions
- [ ] Email notifications for organization status changes
- [ ] Detailed audit log viewer
- [ ] Campaign flagging and moderation
- [ ] Analytics and charts for platform metrics
- [ ] Export data to CSV
- [ ] Admin user management
- [ ] Two-factor authentication for admin access
