"""
WebSocket endpoint for real-time deck share analytics.
"""
import logging
import json
from typing import Dict, Set
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from services.supabase_auth_service import get_auth_service
from utils.supabase import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["websocket"])

# Track active connections per share link
active_connections: Dict[str, Set[WebSocket]] = {}


class ConnectionManager:
    """Manages WebSocket connections for share analytics."""
    
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, share_id: str):
        """Accept connection and add to share's connection pool."""
        await websocket.accept()
        if share_id not in self.active_connections:
            self.active_connections[share_id] = set()
        self.active_connections[share_id].add(websocket)
        logger.info(f"WebSocket connected for share {share_id}")
    
    def disconnect(self, websocket: WebSocket, share_id: str):
        """Remove connection from pool."""
        if share_id in self.active_connections:
            self.active_connections[share_id].discard(websocket)
            if not self.active_connections[share_id]:
                del self.active_connections[share_id]
        logger.info(f"WebSocket disconnected for share {share_id}")
    
    async def broadcast_to_share(self, share_id: str, message: dict):
        """Broadcast message to all connections watching a share."""
        if share_id in self.active_connections:
            dead_connections = set()
            for connection in self.active_connections[share_id]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"Error sending to websocket: {e}")
                    dead_connections.add(connection)
            
            # Clean up dead connections
            for conn in dead_connections:
                self.active_connections[share_id].discard(conn)


manager = ConnectionManager()


@router.websocket("/shares/{share_id}/activity")
async def websocket_share_activity(
    websocket: WebSocket,
    share_id: str
):
    """
    WebSocket endpoint for real-time share activity updates.
    
    Events sent:
    - viewer_joined: When a new viewer accesses the deck
    - slide_viewed: When a viewer navigates to a slide
    - viewer_left: When a viewer closes the deck
    - analytics_update: Periodic analytics updates
    """
    try:
        # Accept the connection
        await manager.connect(websocket, share_id)
        
        # Verify share exists and get initial data
        supabase = get_supabase_client()
        share_result = supabase.table('deck_shares').select('*').eq('id', share_id).execute()
        
        if not share_result.data:
            await websocket.close(code=4004, reason="Share not found")
            return
        
        # Send initial connection success
        await websocket.send_json({
            "type": "connection_established",
            "share_id": share_id,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        # Keep connection alive and handle incoming messages
        while True:
            try:
                # Wait for messages from client
                data = await websocket.receive_json()
                message_type = data.get("type")
                
                if message_type == "viewer_action":
                    # Broadcast viewer action to all connected clients
                    await manager.broadcast_to_share(share_id, {
                        "type": "viewer_activity",
                        "action": data.get("action"),
                        "visitor_id": data.get("visitor_id"),
                        "slide_number": data.get("slide_number"),
                        "timestamp": datetime.utcnow().isoformat()
                    })
                
                elif message_type == "request_analytics":
                    # Send current analytics snapshot
                    # In production, this would query real analytics data
                    await websocket.send_json({
                        "type": "analytics_snapshot",
                        "active_viewers": len(manager.active_connections.get(share_id, set())),
                        "timestamp": datetime.utcnow().isoformat()
                    })
                
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"WebSocket error: {e}")
                break
                
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}")
    finally:
        manager.disconnect(websocket, share_id)


@router.websocket("/shares/{share_id}/presenter")
async def websocket_presenter_view(
    websocket: WebSocket,
    share_id: str,
    token: str = None
):
    """
    WebSocket endpoint for deck owners to monitor real-time activity.
    Requires authentication.
    """
    try:
        # Verify authentication
        if not token:
            await websocket.close(code=4001, reason="Authentication required")
            return
        
        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token)
        
        if not user:
            await websocket.close(code=4001, reason="Invalid token")
            return
        
        user_id = user["id"]
        
        # Verify ownership
        supabase = get_supabase_client()
        share_result = supabase.table('deck_shares').select('*').eq(
            'id', share_id
        ).eq('created_by', user_id).execute()
        
        if not share_result.data:
            await websocket.close(code=4003, reason="Not authorized")
            return
        
        # Accept connection
        await manager.connect(websocket, f"presenter_{share_id}")
        
        # Send initial data
        await websocket.send_json({
            "type": "presenter_connected",
            "share_id": share_id,
            "active_viewers": len(manager.active_connections.get(share_id, set())),
            "timestamp": datetime.utcnow().isoformat()
        })
        
        # Handle presenter-specific messages
        while True:
            try:
                data = await websocket.receive_json()
                
                # Presenter can broadcast messages to viewers
                if data.get("type") == "broadcast_to_viewers":
                    await manager.broadcast_to_share(share_id, {
                        "type": "presenter_message",
                        "message": data.get("message"),
                        "timestamp": datetime.utcnow().isoformat()
                    })
                
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"Presenter WebSocket error: {e}")
                break
                
    except Exception as e:
        logger.error(f"Presenter connection error: {e}")
    finally:
        manager.disconnect(websocket, f"presenter_{share_id}") 