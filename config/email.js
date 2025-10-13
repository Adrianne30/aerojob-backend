const nodemailer = require('nodemailer');

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

// Send OTP email
const sendOTPEmail = async (email, otp, name) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"AeroJob System" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your OTP Verification Code - AeroJob',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .otp-code { font-size: 32px; font-weight: bold; color: #667eea; text-align: center; margin: 20px 0; padding: 15px; background: #fff; border: 2px dashed #667eea; border-radius: 8px; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>AeroJob - Philippine State College of Aeronautics</h1>
              <p>OJT/Internship Management System</p>
            </div>
            <div class="content">
              <h2>Hello ${name},</h2>
              <p>Your One-Time Password (OTP) for email verification is:</p>
              <div class="otp-code">${otp}</div>
              <p>This OTP will expire in 10 minutes. Please use it to complete your registration or password reset process.</p>
              <p>If you didn't request this OTP, please ignore this email or contact support if you have concerns.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} AeroJob - Philippine State College of Aeronautics. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('OTP email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending OTP email:', error);
    throw new Error('Failed to send OTP email');
  }
};

// Send welcome email
const sendWelcomeEmail = async (email, name) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"AeroJob System" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Welcome to AeroJob - Philippine State College of Aeronautics',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to AeroJob!</h1>
              <p>OJT/Internship Management System</p>
            </div>
            <div class="content">
              <h2>Hello ${name},</h2>
              <p>Welcome to the AeroJob platform of Philippine State College of Aeronautics!</p>
              <p>Your account has been successfully created and verified. You can now:</p>
              <ul>
                <li>Search for OJT and internship opportunities</li>
                <li>Apply to job postings from accredited companies</li>
                <li>Manage your profile and application history</li>
                <li>Connect with other students and alumni</li>
              </ul>
              <p>We're excited to help you find the perfect internship opportunity!</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} AeroJob - Philippine State College of Aeronautics. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Welcome email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending welcome email:', error);
    throw new Error('Failed to send welcome email');
  }
};

// Send password reset email
const sendPasswordResetEmail = async (email, resetToken, name) => {
  try {
    const transporter = createTransporter();
    
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: `"AeroJob System" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Password Reset Request - AeroJob',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Reset</h1>
              <p>AeroJob - Philippine State College of Aeronautics</p>
            </div>
            <div class="content">
              <h2>Hello ${name},</h2>
              <p>You requested to reset your password for your AeroJob account.</p>
              <p>Click the button below to reset your password:</p>
              <div style="text-align: center;">
                <a href="${resetLink}" class="button">Reset Password</a>
              </div>
              <p>This link will expire in 1 hour for security reasons.</p>
              <p>If you didn't request this reset, please ignore this email or contact support immediately.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} AeroJob - Philippine State College of Aeronautics. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw new Error('Failed to send password reset email');
  }
};

module.exports = {
  sendOTPEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  createTransporter
};
