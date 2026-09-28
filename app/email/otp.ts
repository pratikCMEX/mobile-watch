interface OtpEmailData {
  name?: string;
  otp: string;
  expiryMinutes?: number;
}

/**
 * Email template for the OTP based "forgot password" flow.
 * Mirrors the styling of app/email/password_reset.ts but shows a
 * copy/paste friendly 6 digit code instead of a reset link.
 */
const generateOtpTemplate = (data: OtpEmailData): string => {
  const { name, otp, expiryMinutes = 10 } = data;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset OTP</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 30px;
          text-align: center;
          border-radius: 10px 10px 0 0;
        }
        .content {
          background: #f9f9f9;
          padding: 30px;
          border-radius: 0 0 10px 10px;
        }
        .otp-box {
          background: white;
          border: 2px dashed #667eea;
          padding: 25px;
          text-align: center;
          margin: 20px 0;
          border-radius: 10px;
        }
        .otp-code {
          font-size: 40px;
          font-weight: bold;
          letter-spacing: 10px;
          color: #667eea;
          margin: 10px 0;
          font-family: 'Courier New', Courier, monospace;
        }
        .expiry {
          color: #666;
          font-size: 14px;
          margin-top: 10px;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          color: #666;
          font-size: 12px;
        }
        .warning {
          color: #e74c3c;
          font-size: 14px;
          margin-top: 15px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Password Reset</h1>
        <p>Your verification code</p>
      </div>

      <div class="content">
        <p>Hello ${name || "User"},</p>
        <p>We received a request to reset your password. Use the verification code below to continue:</p>

        <div class="otp-box">
          <div class="otp-code">${otp}</div>
          <div class="expiry">This code expires in ${expiryMinutes} minutes.</div>
        </div>

        <p>If you did not request a password reset, you can safely ignore this email — your password will not change.</p>

        <p class="warning">Never share this code with anyone. Our support team will never ask you for it.</p>
      </div>

      <div class="footer">
        <p>Thank you for using our service.</p>
      </div>
    </body>
    </html>
  `;
};

export default generateOtpTemplate;
