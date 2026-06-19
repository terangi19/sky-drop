# Database Backup Strategy

## Overview
This document outlines the backup strategy for Sky Drop's Firebase Firestore and Storage data.

## Firebase Native Backups

### Firestore
Firebase provides automatic daily backups for Firestore with 30-day retention. These are managed by Google Cloud.

**To enable/verify:**
1. Go to Firebase Console → Firestore Database → Backups
2. Ensure daily backups are scheduled
3. Verify retention period is set to 30 days
4. Test restore process in a staging environment

### Storage
Firebase Storage provides built-in redundancy across multiple zones. For additional protection:

**Recommended:**
- Enable object versioning in Firebase Storage Console
- Configure lifecycle policies to archive old versions
- Set up Cloud Storage transfer service to copy critical data to another region

## Backup Types

### Automated Backups
- **Frequency:** Daily (handled by Firebase)
- **Retention:** 30 days
- **Scope:** All Firestore collections and Storage
- **Recovery Time:** Within 4 hours

### Manual Backups
Run before major changes or deployments:

```bash
# Export Firestore data
gcloud firestore export gs://sky-drop-backups/firestore \
  --collection-ids=profiles,listings,users,purchases,conversations

# Export Storage data
gsutil -m rsync -r gs://sky-drop.appspot.com gs://sky-drop-backups/storage
```

## Backup Locations

### Primary
- Firebase managed backups (automatic)
- Location: Same region as Firebase project

### Secondary (Recommended)
- Google Cloud Storage bucket in different region
- Configure cross-region replication

### Off-site (Critical)
- Consider exporting to Google Cloud Storage Coldline for long-term archival
- Monthly exports for compliance

## Recovery Procedures

### Point-in-Time Recovery (Firestore)
1. Go to Firebase Console → Firestore Database → Backups
2. Select the backup to restore
3. Choose target database (create new for testing)
4. Initiate restore
5. Verify data integrity
6. Update DNS/routing if switching to restored database

### Storage Recovery
1. Enable object versioning before any deletion
2. Restore from object versions if available
3. Or restore from secondary backup location

## Testing

### Monthly Backup Verification
- Restore a random backup to staging environment
- Verify data integrity
- Test application functionality with restored data
- Document any issues

### Disaster Recovery Drill (Quarterly)
- Simulate complete data loss scenario
- Execute full recovery procedure
- Measure recovery time objective (RTO)
- Measure recovery point objective (RPO)
- Update procedures based on findings

## Backup Retention

| Type | Retention | Purpose |
|------|-----------|---------|
| Daily automated | 30 days | Operational recovery |
| Weekly exports | 90 days | Extended recovery |
| Monthly exports | 1 year | Compliance |
| Annual exports | 7 years | Legal/compliance |

## Critical Collections

Prioritize these collections for backup verification:
- `profiles` - User accounts and KYC data
- `listings` - All marketplace listings
- `purchases` - Transaction records
- `conversations` - Communication history
- `messages` - Message history
- `kycSubmissions` - KYC verification documents (metadata only)

## Monitoring

Set up alerts for:
- Backup failures
- Storage quota approaching limits
- Unusual data deletion patterns
- Backup size anomalies

## Access Control

**Who can access backups:**
- System administrators only
- Access logged via audit trail
- MFA required for backup access

**Encryption:**
- All backups encrypted at rest (Google Cloud default)
- Encryption keys managed by Google Cloud KMS
- No unencrypted backups stored

## Compliance

This backup strategy addresses:
- Data retention requirements
- Disaster recovery needs
- GDPR "right to be forgotten" (can selectively restore without deleted data)
- Financial record retention (purchases, transactions)

## Contact

For backup-related issues:
- Primary: [Platform Owner]
- Secondary: [DevOps Team]
- Emergency: [On-Call Engineer]

---

**Last Updated:** June 2026
**Next Review:** September 2026
