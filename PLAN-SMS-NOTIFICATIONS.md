# AWS SNS SMS Notifications Implementation Plan

## Overview
Add SMS notifications via AWS SNS when a reservation form is submitted. The notification will be sent to your phone number (18196787139).

## Architecture

```
User submits form → React App → Netlify Function → AWS SNS → SMS to your phone
```

**Why a Netlify Function?**
- AWS credentials cannot be exposed in frontend code (security risk)
- Netlify Functions run server-side, keeping credentials secure
- Free tier: 125,000 function invocations/month

## Implementation Steps

### Step 1: AWS Setup (Manual - in AWS Console)

1. **Create IAM User for SNS**
   - Go to AWS Console → IAM → Users → Create User
   - Name: `cabane-sns-user`
   - Attach policy: `AmazonSNSFullAccess` (or create custom policy for just `sns:Publish`)
   - Create Access Key → Save the Access Key ID and Secret Access Key

2. **Verify Phone Number (Sandbox Mode)**
   - Go to AWS Console → SNS → Text messaging (SMS)
   - Add phone number: `+18196787139`
   - Verify with code sent to your phone
   - Note: In sandbox mode, you can only send to verified numbers (fine for your use case)

3. **Set SMS Preferences**
   - Default message type: `Transactional` (higher delivery priority)
   - Spend limit: Set to $1/month (safety net)

### Step 2: Project Structure Changes

```
cabane-syrup-orders/
├── netlify/
│   └── functions/
│       └── send-sms.js          # NEW: Serverless function
├── src/
│   └── App.jsx                  # MODIFY: Call the function
├── netlify.toml                 # MODIFY: Add functions config
└── package.json                 # MODIFY: Add @aws-sdk/client-sns
```

### Step 3: Environment Variables (Netlify Dashboard)

Set these in Netlify → Site Settings → Environment Variables:
- `AWS_ACCESS_KEY_ID` = (from Step 1)
- `AWS_SECRET_ACCESS_KEY` = (from Step 1)
- `AWS_REGION` = `us-east-1` (or `ca-central-1` for Canada)
- `SMS_PHONE_NUMBER` = `+18196787139`

### Step 4: Code Changes

#### A. Create Netlify Function (`netlify/functions/send-sms.js`)

```javascript
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const client = new SNSClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export const handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { nom, telephone, produit, quantite, instructions } = JSON.parse(event.body);

    // Build SMS message (160 char limit for single SMS)
    const message = `🍁 Nouvelle réservation!\n${nom}\n📞 ${telephone}\n${produit || 'Panier'}\n${instructions ? instructions.substring(0, 50) : ''}`;

    const command = new PublishCommand({
      PhoneNumber: process.env.SMS_PHONE_NUMBER,
      Message: message.substring(0, 160),
      MessageAttributes: {
        "AWS.SNS.SMS.SMSType": {
          DataType: "String",
          StringValue: "Transactional",
        },
      },
    });

    await client.send(command);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error("SMS Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to send SMS" }),
    };
  }
};
```

#### B. Modify `netlify.toml`

```toml
[build]
  command = "npm run build"
  publish = "dist"
  functions = "netlify/functions"

[build.environment]
  NODE_VERSION = "18"

# ... rest of config
```

#### C. Modify `App.jsx` - Add SMS call in handleSubmit

After the Netlify form submission (around line 776), add:

```javascript
// Send SMS notification (best-effort, don't block on failure)
try {
  await fetch('/.netlify/functions/send-sms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nom: submissionData.nom,
      telephone: submissionData.telephone,
      produit: submissionData.produit || getCartSummary(),
      quantite: submissionData.quantite,
      instructions: submissionData.instructions
    })
  });
} catch {
  // SMS failed silently - form submission still succeeded
}
```

#### D. Update `package.json`

Add to dependencies:
```json
"@aws-sdk/client-sns": "^3.0.0"
```

### Step 5: Local Testing

1. Install Netlify CLI: `npm install -g netlify-cli`
2. Create `.env` file (gitignored) with AWS credentials
3. Run: `netlify dev` (this runs both Vite and functions locally)

### Step 6: Deployment

1. Push code to GitHub
2. Add environment variables in Netlify Dashboard
3. Deploy triggers automatically
4. Test with a real form submission

## Cost Analysis

- **AWS SNS SMS**: First 100 SMS/month free, then ~$0.00645/SMS to US numbers
- **500 messages/year** = ~42/month = **$0 (free tier)**
- **Netlify Functions**: 125,000/month free = **$0**

## Security Considerations

✅ AWS credentials stored in environment variables (not in code)
✅ Serverless function keeps credentials server-side
✅ Phone number stored in env var (not hardcoded)
✅ Function validates HTTP method
✅ Error handling prevents credential leaks in responses

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `netlify/functions/send-sms.js` | CREATE | Serverless function for SMS |
| `netlify.toml` | MODIFY | Add functions directory |
| `src/App.jsx` | MODIFY | Call SMS function on submit |
| `package.json` | MODIFY | Add AWS SDK dependency |
| `.env` | CREATE | Local dev credentials (gitignored) |
| `.gitignore` | MODIFY | Add .env if not present |
