"""
Structured logging configuration for generation system.

Provides:
- JSON structured logging
- Performance logging
- Request tracking
- Error aggregation
"""

import logging
import json
import sys
import time
from typing import Dict, Any, Optional
from datetime import datetime
from contextvars import ContextVar
from functools import wraps

from agents.generation.config import get_config

# Context variables for request tracking
request_id_var: ContextVar[Optional[str]] = ContextVar('request_id', default=None)
deck_id_var: ContextVar[Optional[str]] = ContextVar('deck_id', default=None)
slide_index_var: ContextVar[Optional[int]] = ContextVar('slide_index', default=None)


class StructuredFormatter(logging.Formatter):
    """JSON structured log formatter"""
    
    def format(self, record: logging.LogRecord) -> str:
        # Base log data
        log_data = {
            'timestamp': datetime.utcnow().isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
        }
        
        # Add context if available
        request_id = request_id_var.get()
        if request_id:
            log_data['request_id'] = request_id
            
        deck_id = deck_id_var.get()
        if deck_id:
            log_data['deck_id'] = deck_id
            
        slide_index = slide_index_var.get()
        if slide_index is not None:
            log_data['slide_index'] = slide_index
        
        # Add exception info if present
        if record.exc_info:
            log_data['exception'] = self.formatException(record.exc_info)
        
        # Add custom attributes
        for key, value in record.__dict__.items():
            if key not in ['name', 'msg', 'args', 'created', 'filename', 
                          'funcName', 'levelname', 'levelno', 'lineno', 
                          'module', 'msecs', 'message', 'pathname', 'process',
                          'processName', 'relativeCreated', 'thread', 'threadName',
                          'exc_info', 'exc_text', 'stack_info']:
                log_data[key] = value
        
        return json.dumps(log_data)


class PerformanceLogger:
    """Logger for performance metrics"""
    
    def __init__(self, logger: logging.Logger):
        self.logger = logger
        self.metrics: Dict[str, list] = {}
    
    def log_operation(self, operation: str, duration: float, **kwargs):
        """Log an operation's performance"""
        self.logger.info(
            f"Operation {operation} completed",
            extra={
                'operation': operation,
                'duration_ms': round(duration * 1000, 2),
                'performance': True,
                **kwargs
            }
        )
        
        # Track for aggregation
        if operation not in self.metrics:
            self.metrics[operation] = []
        self.metrics[operation].append(duration)
    
    def log_aggregated_metrics(self):
        """Log aggregated performance metrics"""
        for operation, durations in self.metrics.items():
            if durations:
                avg_duration = sum(durations) / len(durations)
                min_duration = min(durations)
                max_duration = max(durations)
                
                self.logger.info(
                    f"Performance summary for {operation}",
                    extra={
                        'operation': operation,
                        'avg_duration_ms': round(avg_duration * 1000, 2),
                        'min_duration_ms': round(min_duration * 1000, 2),
                        'max_duration_ms': round(max_duration * 1000, 2),
                        'count': len(durations),
                        'performance_summary': True
                    }
                )


def configure_logging():
    """Configure structured logging for the application"""
    config = get_config().logging
    
    # Remove existing handlers
    root_logger = logging.getLogger()
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # Create handler
    handler = logging.StreamHandler(sys.stdout)
    
    # Set formatter based on config
    if config.format == 'json':
        handler.setFormatter(StructuredFormatter())
    else:
        # Traditional format
        handler.setFormatter(
            logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
        )
    
    # Set level
    log_level = getattr(logging, config.level.upper(), logging.INFO)
    root_logger.setLevel(log_level)
    handler.setLevel(log_level)
    
    # Add handler
    root_logger.addHandler(handler)
    
    # Configure specific loggers
    if not config.enable_ai_logging:
        logging.getLogger('agents.ai').setLevel(logging.WARNING)
    
    # Reduce noise from third-party libraries
    logging.getLogger('urllib3').setLevel(logging.WARNING)
    logging.getLogger('httpx').setLevel(logging.WARNING)
    
    return root_logger


def get_logger(name: str) -> logging.Logger:
    """Get a configured logger"""
    logger = logging.getLogger(name)
    
    # Add performance logger as attribute
    if not hasattr(logger, 'perf'):
        logger.perf = PerformanceLogger(logger)
    
    return logger


def with_context(**context_vars):
    """Decorator to set context variables for a function"""
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            # Set context variables
            tokens = []
            for var_name, value in context_vars.items():
                if var_name == 'request_id' and value:
                    tokens.append(request_id_var.set(value))
                elif var_name == 'deck_id' and value:
                    tokens.append(deck_id_var.set(value))
                elif var_name == 'slide_index' and value is not None:
                    tokens.append(slide_index_var.set(value))
            
            try:
                return await func(*args, **kwargs)
            finally:
                # Reset context
                for token in tokens:
                    request_id_var.reset(token)
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            # Set context variables
            tokens = []
            for var_name, value in context_vars.items():
                if var_name == 'request_id' and value:
                    tokens.append(request_id_var.set(value))
                elif var_name == 'deck_id' and value:
                    tokens.append(deck_id_var.set(value))
                elif var_name == 'slide_index' and value is not None:
                    tokens.append(slide_index_var.set(value))
            
            try:
                return func(*args, **kwargs)
            finally:
                # Reset context
                for token in tokens:
                    request_id_var.reset(token)
        
        # Return appropriate wrapper
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


def log_performance(operation: str):
    """Decorator to log function performance"""
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            logger = get_logger(func.__module__)
            start_time = time.time()
            
            try:
                result = await func(*args, **kwargs)
                duration = time.time() - start_time
                
                if get_config().logging.enable_performance_logging:
                    logger.perf.log_operation(operation, duration)
                
                return result
                
            except Exception as e:
                duration = time.time() - start_time
                logger.error(
                    f"{operation} failed after {duration:.2f}s",
                    extra={'operation': operation, 'duration': duration},
                    exc_info=True
                )
                raise
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            logger = get_logger(func.__module__)
            start_time = time.time()
            
            try:
                result = func(*args, **kwargs)
                duration = time.time() - start_time
                
                if get_config().logging.enable_performance_logging:
                    logger.perf.log_operation(operation, duration)
                
                return result
                
            except Exception as e:
                duration = time.time() - start_time
                logger.error(
                    f"{operation} failed after {duration:.2f}s",
                    extra={'operation': operation, 'duration': duration},
                    exc_info=True
                )
                raise
        
        # Return appropriate wrapper
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


# Import asyncio at module level for decorator checks
import asyncio 