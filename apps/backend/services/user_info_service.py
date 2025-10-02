"""
User Information Service for personalizing presentations with user data.
Handles fetching and formatting user information for use in decks.
"""
import logging
from typing import Dict, Any, Optional
from datetime import datetime
logger = logging.getLogger(__name__)

# Try to import auth service, but allow fallback
try:
    from services.supabase_auth_service import get_auth_service
    AUTH_SERVICE_AVAILABLE = True
except ImportError:
    AUTH_SERVICE_AVAILABLE = False
    logger.warning("Supabase auth service not available - using mock data")


class UserInfoService:
    """Service for managing and retrieving user information for presentation personalization."""
    
    def __init__(self):
        self.auth_service = get_auth_service() if AUTH_SERVICE_AVAILABLE else None
        self._user_cache = {}  # Simple in-memory cache
    
    def get_user_info(self, user_id: str) -> Dict[str, Any]:
        """
        Retrieve comprehensive user information for deck personalization.
        
        Args:
            user_id: The user's UUID
            
        Returns:
            Dict containing user information with fallback values
        """
        # Check cache first
        if user_id in self._user_cache:
            cached = self._user_cache[user_id]
            if datetime.now().timestamp() - cached.get('_cached_at', 0) < 300:  # 5 min cache
                return cached
        
        try:
            # Get user profile from database
            profile = None
            if self.auth_service:
                profile = self.auth_service.get_user_profile(user_id)
            
            if profile:
                user_info = self._extract_user_info(profile)
            else:
                # Try to get basic info from auth user
                user = self._get_auth_user(user_id)
                user_info = self._extract_user_info_from_auth(user)
            
            # Cache the result
            user_info['_cached_at'] = datetime.now().timestamp()
            self._user_cache[user_id] = user_info
            
            return user_info
            
        except Exception as e:
            logger.error(f"Error getting user info for {user_id}: {str(e)}")
            return self._get_default_user_info()
    
    def _extract_user_info(self, profile: Dict[str, Any]) -> Dict[str, Any]:
        """Extract user information from profile data."""
        # Get basic info
        email = profile.get('email', '')
        
        # Extract name from various possible fields
        name = (
            profile.get('full_name') or 
            profile.get('name') or 
            profile.get('display_name') or 
            profile.get('first_name', '') + ' ' + profile.get('last_name', '') or
            self._extract_name_from_email(email)
        ).strip()
        
        # Extract organization from profile
        organization = (
            profile.get('company') or 
            profile.get('organization') or 
            profile.get('company_name') or
            ''
        ).strip()
        
        # Extract other useful fields
        job_title = profile.get('job_title', '') or profile.get('title', '')
        department = profile.get('department', '')
        
        return {
            'name': name or 'Presenter',
            'email': email,
            'organization': organization,
            'job_title': job_title,
            'department': department,
            'initials': self._get_initials(name),
            'first_name': self._get_first_name(name),
            'formatted_date': self._get_formatted_date(),
            'presentation_date': datetime.now().strftime('%B %d, %Y'),
            'year': datetime.now().year
        }
    
    def _extract_user_info_from_auth(self, user: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Extract user information from auth user object."""
        if not user:
            return self._get_default_user_info()
        
        email = user.get('email', '')
        user_metadata = user.get('user_metadata', {})
        
        # Try to get name from metadata
        name = (
            user_metadata.get('full_name') or
            user_metadata.get('name') or
            user_metadata.get('display_name') or
            self._extract_name_from_email(email)
        ).strip()
        
        # Try to get organization from metadata
        organization = (
            user_metadata.get('company') or
            user_metadata.get('organization') or
            ''
        ).strip()
        
        return {
            'name': name or 'Presenter',
            'email': email,
            'organization': organization,
            'job_title': user_metadata.get('job_title', ''),
            'department': user_metadata.get('department', ''),
            'initials': self._get_initials(name),
            'first_name': self._get_first_name(name),
            'formatted_date': self._get_formatted_date(),
            'presentation_date': datetime.now().strftime('%B %d, %Y'),
            'year': datetime.now().year
        }
    
    def _get_auth_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user from auth service by ID."""
        try:
            # This is a workaround - ideally we'd have a method to get user by ID
            # For now, return None and rely on profile data
            return None
        except Exception:
            return None
    
    def _extract_name_from_email(self, email: str) -> str:
        """Extract a name from email address."""
        if not email or '@' not in email:
            return ''
        
        username = email.split('@')[0]
        # Convert common patterns to names
        # john.doe -> John Doe
        # john_doe -> John Doe
        # johndoe -> John Doe (best guess)
        
        if '.' in username:
            parts = username.split('.')
        elif '_' in username:
            parts = username.split('_')
        elif '-' in username:
            parts = username.split('-')
        else:
            # Try to split camelCase
            import re
            parts = re.findall('[A-Z][a-z]*|[a-z]+', username)
            if not parts:
                parts = [username]
        
        return ' '.join(part.capitalize() for part in parts if part)
    
    def _get_initials(self, name: str) -> str:
        """Get initials from name."""
        if not name:
            return 'P'
        
        parts = name.split()
        if len(parts) >= 2:
            return f"{parts[0][0]}{parts[-1][0]}".upper()
        elif parts:
            return parts[0][0].upper()
        return 'P'
    
    def _get_first_name(self, name: str) -> str:
        """Get first name from full name."""
        if not name:
            return 'Friend'
        
        parts = name.split()
        return parts[0] if parts else 'Friend'
    
    def _get_formatted_date(self) -> str:
        """Get formatted date string."""
        return datetime.now().strftime('%B %Y')
    
    def _get_default_user_info(self) -> Dict[str, Any]:
        """Get default user information when no data is available."""
        return {
            'name': 'Presenter',
            'email': '',
            'organization': 'Your Organization',
            'job_title': '',
            'department': '',
            'initials': 'P',
            'first_name': 'Friend',
            'formatted_date': self._get_formatted_date(),
            'presentation_date': datetime.now().strftime('%B %d, %Y'),
            'year': datetime.now().year
        }
    
    def format_metadata_line(self, user_info: Dict[str, Any], pattern: Optional[str] = None) -> str:
        """
        Format a metadata line for title slides.
        
        Args:
            user_info: User information dict
            pattern: Optional pattern string with placeholders like {name}, {organization}, {date}
            
        Returns:
            Formatted metadata string
        """
        if not pattern:
            # Default pattern
            pattern = "{name} — {organization} — {date}"
        
        # Available substitutions
        substitutions = {
            'name': user_info.get('name', 'Presenter'),
            'organization': user_info.get('organization', ''),
            'date': user_info.get('formatted_date', ''),
            'presentation_date': user_info.get('presentation_date', ''),
            'email': user_info.get('email', ''),
            'job_title': user_info.get('job_title', ''),
            'department': user_info.get('department', ''),
            'year': str(user_info.get('year', '')),
            'initials': user_info.get('initials', ''),
            'first_name': user_info.get('first_name', '')
        }
        
        # Format the pattern
        result = pattern
        for key, value in substitutions.items():
            result = result.replace(f'{{{key}}}', value)
        
        # Clean up empty segments
        # Remove "— —" patterns
        result = result.replace(' — —', ' —').replace('—  —', '—')
        # Remove trailing/leading separators
        result = result.strip(' —')
        
        return result
    
    def get_thank_you_message(self, user_info: Dict[str, Any], style: str = 'formal') -> str:
        """
        Generate a personalized thank you message.
        
        Args:
            user_info: User information dict
            style: Message style ('formal', 'casual', 'friendly')
            
        Returns:
            Personalized thank you message
        """
        name = user_info.get('first_name', 'everyone')
        
        if style == 'casual':
            return f"Thanks, {name}!"
        elif style == 'friendly':
            return f"Thank you, {name}! Looking forward to your questions."
        else:  # formal
            return f"Thank you for your attention"
    
    def replace_placeholders(self, text: str, user_info: Dict[str, Any]) -> str:
        """
        Replace common placeholders in text with actual user information.
        
        Args:
            text: Text containing placeholders
            user_info: User information dict
            
        Returns:
            Text with placeholders replaced
        """
        replacements = {
            '[Your Name]': user_info.get('name', 'Presenter'),
            '[Organization]': user_info.get('organization', 'Your Organization'),
            '[Date]': user_info.get('formatted_date', datetime.now().strftime('%B %Y')),
            '[presenter]': user_info.get('name', 'Presenter'),
            '[email]': user_info.get('email', 'email@example.com'),
            '[PRESENTER_NAME]': user_info.get('name', 'Presenter'),
            '[COMPANY]': user_info.get('organization', 'Your Organization'),
            '[YOUR_NAME]': user_info.get('name', 'Presenter'),
            '[YOUR_EMAIL]': user_info.get('email', 'email@example.com'),
        }
        
        result = text
        for placeholder, value in replacements.items():
            result = result.replace(placeholder, value)
        
        return result


# Singleton instance
_user_info_service = None

def get_user_info_service() -> UserInfoService:
    """Get the singleton user info service instance."""
    global _user_info_service
    if _user_info_service is None:
        _user_info_service = UserInfoService()
    return _user_info_service
