interface PasswordResetData {
  name?: string;
  resetLink: string;
  expiryTime?: string;
}

const generatePasswordResetTemplate = (data: PasswordResetData, baseUrl: string = '') => {
  const { name, resetLink, expiryTime } = data;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset</title>
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
        .reset-box {
          background: white;
          border: 2px dashed #667eea;
          padding: 20px;
          text-align: center;
          margin: 20px 0;
          border-radius: 10px;
        }
        .reset-link {
          display: inline-block;
          background: #667eea;
          color: white;
          padding: 12px 30px;
          text-decoration: none;
          border-radius: 5px;
          margin: 10px 0;
          font-weight: bold;
        }
        .reset-link:hover {
          background: #5568d3;
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
        <h1>Password Reset Request</h1>
        <p>Reset your password securely</p>
      </div>
      
      <div class="content">
        <p>Hello ${name || 'User'},</p>
        <p>We received a request to reset your password. Click the button below to reset your password:</p>
        
        <div class="reset-box">
          <div class="reset-link">
            <a href="${resetLink}" style="color: white; text-decoration: none;">Reset Password</a>
          </div>
          
          ${expiryTime ? `<p class="expiry">This link expires at: ${new Date(expiryTime).toLocaleString()}</p>` : ''}
        </div>
        
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #667eea;">${resetLink}</p>
        
        <p class="warning">If you didn't request this password reset, please ignore this email.</p>
      </div>
      
      <div class="footer">
        <p>This is an automated email. Please do not reply.</p>
      </div>
    </body>
    </html>
  `;
};

export default generatePasswordResetTemplate;
