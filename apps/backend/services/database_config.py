#!/usr/bin/env python3
"""
Database Configuration for Brandfetch Caching
Centralized database connection configuration for the caching system.
"""

import os
from typing import Optional

def get_database_connection_string() -> str:
    """
    Get the database connection string from environment variables.
    
    Returns:
        Database connection string for PostgreSQL/Supabase
        
    Raises:
        ValueError: If no database connection string is configured
    """
    # Try multiple environment variable names
    connection_string = (
        os.getenv('DATABASE_URL') or
        os.getenv('SUPABASE_DATABASE_URL') or 
        os.getenv('POSTGRES_URL') or
        os.getenv('POSTGRESQL_URL')
    )
    
    if connection_string:
        return connection_string
    
    # If no direct connection string, try to build from components
    db_host = os.getenv('DB_HOST', os.getenv('SUPABASE_HOST'))
    db_port = os.getenv('DB_PORT', '5432')
    db_name = os.getenv('DB_NAME', os.getenv('POSTGRES_DB', 'postgres'))
    db_user = os.getenv('DB_USER', os.getenv('POSTGRES_USER', 'postgres'))
    db_password = os.getenv('DB_PASSWORD', os.getenv('POSTGRES_PASSWORD'))
    
    if all([db_host, db_port, db_name, db_user, db_password]):
        return f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
    
    # If still no connection string, provide instructions
    raise ValueError(
        "No database connection string found. Please set one of the following environment variables:\n"
        "- DATABASE_URL\n"
        "- SUPABASE_DATABASE_URL\n"
        "- POSTGRES_URL\n"
        "Or set individual components:\n"
        "- DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD\n"
        "- SUPABASE_HOST and POSTGRES_PASSWORD\n\n"
        "Example for Supabase:\n"
        "DATABASE_URL='postgresql://postgres.your-project:[password]@aws-0-region.pooler.supabase.com:6543/postgres'"
    )


def get_cache_ttl_hours() -> Optional[int]:
    """
    Get cache TTL (time to live) in hours from environment.
    
    Returns:
        Cache TTL in hours, or None for permanent storage (default: None = permanent)
    """
    ttl_str = os.getenv('BRANDFETCH_CACHE_TTL_HOURS', 'permanent')
    if ttl_str.lower() in ('permanent', 'never', 'none', '0', ''):
        return None
    return int(ttl_str)


def is_database_caching_enabled() -> bool:
    """
    Check if database caching is enabled via environment variable.
    
    Returns:
        True if caching is enabled, False otherwise
    """
    return os.getenv('ENABLE_BRANDFETCH_CACHE', 'true').lower() == 'true'


# Pre-validate configuration on import (optional)
def validate_database_config() -> Optional[str]:
    """
    Validate database configuration without raising exceptions.
    
    Returns:
        Error message if configuration is invalid, None if valid
    """
    try:
        connection_string = get_database_connection_string()
        if not connection_string or len(connection_string) < 10:
            return "Database connection string is too short or empty"
        
        if not connection_string.startswith(('postgresql://', 'postgres://')):
            return "Database connection string must start with postgresql:// or postgres://"
        
        return None
    except Exception as e:
        return str(e)