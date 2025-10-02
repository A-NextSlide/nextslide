#!/usr/bin/env python3
"""
Email Service Setup Guide for Magic Links
"""

def show_sendgrid_setup():
    """Show SendGrid setup example"""
    print("\n📧 SendGrid Setup:")
    print("="*50)
    print("\n1. Install SendGrid:")
    print("   pip install sendgrid")
    
    print("\n2. Get API Key from https://app.sendgrid.com/")
    print("   Add to .env: SENDGRID_API_KEY=your_key_here")
    
    print("\n3. Update _send_magic_link_email in supabase_auth_service.py:")
    print("""
    import sendgrid
    from sendgrid.helpers.mail import Mail
    
    async def _send_magic_link_email(self, email: str, token: str) -> None:
        sg = sendgrid.SendGridAPIClient(api_key=os.getenv('SENDGRID_API_KEY'))
        
        base_url = os.getenv("FRONTEND_URL", "http://localhost:8080")
        magic_link_url = f"{base_url}/magic-link-verify?token={token}"
        
        message = Mail(
            from_email='noreply@nextslide.com',
            to_emails=email,
            subject='Sign in to Next.Slide',
            html_content=f'''
            <h2>Sign in to Next.Slide</h2>
            <p>Click the link below to sign in:</p>
            <a href="{magic_link_url}" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px;">
                Sign In
            </a>
            <p>Or copy this link: {magic_link_url}</p>
            <p>This link expires in 15 minutes for security.</p>
            '''
        )
        
        response = sg.send(message)
        logger.info(f"Email sent to {email}, status: {response.status_code}")
    """)

def show_aws_ses_setup():
    """Show AWS SES setup example"""
    print("\n📧 AWS SES Setup:")
    print("="*50)
    print("\n1. Install boto3:")
    print("   pip install boto3")
    
    print("\n2. Set AWS credentials in .env:")
    print("   AWS_ACCESS_KEY_ID=your_key")
    print("   AWS_SECRET_ACCESS_KEY=your_secret")
    print("   AWS_REGION=us-east-1")
    
    print("\n3. Update _send_magic_link_email:")
    print("""
    import boto3
    from botocore.exceptions import ClientError
    
    async def _send_magic_link_email(self, email: str, token: str) -> None:
        ses = boto3.client(
            'ses',
            region_name=os.getenv('AWS_REGION', 'us-east-1'),
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY')
        )
        
        base_url = os.getenv("FRONTEND_URL", "http://localhost:8080")
        magic_link_url = f"{base_url}/magic-link-verify?token={token}"
        
        try:
            response = ses.send_email(
                Source='noreply@nextslide.com',
                Destination={'ToAddresses': [email]},
                Message={
                    'Subject': {'Data': 'Sign in to Next.Slide'},
                    'Body': {
                        'Html': {
                            'Data': f'''
                            <h2>Sign in to Next.Slide</h2>
                            <p>Click here to sign in: <a href="{magic_link_url}">Sign In</a></p>
                            <p>This link expires in 15 minutes.</p>
                            '''
                        }
                    }
                }
            )
            logger.info(f"Email sent to {email}, MessageId: {response['MessageId']}")
        except ClientError as e:
            logger.error(f"AWS SES error: {e}")
            raise
    """)

def show_resend_setup():
    """Show Resend setup example"""
    print("\n📧 Resend Setup (Recommended - Modern & Simple):")
    print("="*50)
    print("\n1. Install Resend:")
    print("   pip install resend")
    
    print("\n2. Get API Key from https://resend.com/")
    print("   Add to .env: RESEND_API_KEY=your_key_here")
    
    print("\n3. Update _send_magic_link_email:")
    print("""
    import resend
    
    async def _send_magic_link_email(self, email: str, token: str) -> None:
        resend.api_key = os.getenv("RESEND_API_KEY")
        
        base_url = os.getenv("FRONTEND_URL", "http://localhost:8080")
        magic_link_url = f"{base_url}/magic-link-verify?token={token}"
        
        params = {
            "from": "Next.Slide <noreply@nextslide.com>",
            "to": [email],
            "subject": "Sign in to Next.Slide",
            "html": f'''
            <h2>Sign in to Next.Slide</h2>
            <p>You requested a magic link to sign in.</p>
            <p>
                <a href="{magic_link_url}" style="display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
                    Sign in to Next.Slide
                </a>
            </p>
            <p style="color: #666; font-size: 14px;">
                Or copy this link: {magic_link_url}
            </p>
            <p style="color: #666; font-size: 14px;">
                This link will expire in 15 minutes for security reasons.
            </p>
            '''
        }
        
        email_sent = resend.Emails.send(params)
        logger.info(f"Email sent to {email}, ID: {email_sent['id']}")
    """)

def main():
    print("🔧 EMAIL SERVICE SETUP FOR MAGIC LINKS")
    print("="*60)
    print("\nChoose an email service provider:")
    print("1. Resend (Recommended - Modern, easy setup)")
    print("2. SendGrid (Popular, reliable)")
    print("3. AWS SES (Cost-effective for high volume)")
    print("4. Show all options")
    
    choice = input("\nEnter choice (1-4): ").strip()
    
    if choice == "1":
        show_resend_setup()
    elif choice == "2":
        show_sendgrid_setup()
    elif choice == "3":
        show_aws_ses_setup()
    else:
        show_resend_setup()
        show_sendgrid_setup()
        show_aws_ses_setup()
    
    print("\n" + "="*60)
    print("📝 Next Steps:")
    print("1. Choose and install your preferred email service")
    print("2. Get API keys from the service provider")
    print("3. Add API keys to your .env file")
    print("4. Update _send_magic_link_email method in supabase_auth_service.py")
    print("5. Test with a real email address!")

if __name__ == "__main__":
    main()