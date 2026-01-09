"""Database models for KORE SUPER SIM connection events."""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, JSON, Index
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


class ConnectionEvent(Base):
    """Stores a flattened snapshot of a KORE SUPER SIM connection event.
    
    Based on CloudEvents 1.0 specification with KORE SUPER SIM event schema.
    Event types: com.kore.iot.supersim.connection.data-session.{started|updated|ended}
    """
    
    __tablename__ = "connection_events"
    
    # Primary key
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # CloudEvents fields
    event_sid = Column(String, unique=True, nullable=False, index=True)
    event_type = Column(String, nullable=False, index=True)
    event_time = Column(DateTime, nullable=False, index=True)
    
    # SIM identifiers
    sim_iccid = Column(String, nullable=False, index=True)
    sim_unique_name = Column(String, index=True)
    sim_sid = Column(String, index=True)
    fleet_sid = Column(String, index=True)
    
    # Device identifiers
    imei = Column(String, index=True)
    imsi = Column(String, index=True)
    apn = Column(String)
    
    # Network information
    network_mcc = Column(String, index=True)  # Mobile Country Code
    network_mnc = Column(String, index=True)  # Mobile Network Code
    network_name = Column(String)  # Operator friendly name
    network_iso_country = Column(String, index=True)  # ISO country code
    rat_type = Column(String, index=True)  # Radio Access Technology (LTE, 5G, etc.)
    
    # Location data
    latitude = Column(Float, index=True)
    longitude = Column(Float, index=True)
    lac = Column(String, index=True)  # Location Area Code
    cell_id = Column(String, index=True)  # Cell tower ID
    
    # Data usage (in bytes)
    data_total = Column(Integer)
    data_upload = Column(Integer)
    data_download = Column(Integer)
    
    # Connection details
    ip_address = Column(String)
    account_sid = Column(String, index=True)
    
    # Security and reliability
    idempotency_token = Column(String, unique=True, index=True)
    kore_signature = Column(String)
    
    # Metadata
    payload = Column(JSON)  # Full CloudEvents payload
    webhook_received_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    remote_addr = Column(String)  # IP of webhook sender
    
    # Composite indexes for common queries
    __table_args__ = (
        Index('idx_iccid_time', 'sim_iccid', 'event_time'),
        Index('idx_type_time', 'event_type', 'event_time'),
        Index('idx_country_time', 'network_iso_country', 'event_time'),
        Index('idx_fleet_time', 'fleet_sid', 'event_time'),
        Index('idx_idempotency', 'idempotency_token'),
    )
    
    def __repr__(self):
        return (
            f"<ConnectionEvent(id={self.id}, "
            f"event_sid={self.event_sid}, "
            f"event_type={self.event_type}, "
            f"sim_iccid={self.sim_iccid}, "
            f"event_time={self.event_time})>"
        )
    
    def to_dict(self):
        """Convert model to dictionary for JSON serialization."""
        return {
            'id': self.id,
            'event_sid': self.event_sid,
            'event_type': self.event_type,
            'event_time': self.event_time.isoformat() if self.event_time else None,
            'sim_iccid': self.sim_iccid,
            'sim_unique_name': self.sim_unique_name,
            'sim_sid': self.sim_sid,
            'fleet_sid': self.fleet_sid,
            'imei': self.imei,
            'imsi': self.imsi,
            'apn': self.apn,
            'network_mcc': self.network_mcc,
            'network_mnc': self.network_mnc,
            'network_name': self.network_name,
            'network_iso_country': self.network_iso_country,
            'rat_type': self.rat_type,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'lac': self.lac,
            'cell_id': self.cell_id,
            'data_total': self.data_total,
            'data_upload': self.data_upload,
            'data_download': self.data_download,
            'ip_address': self.ip_address,
            'account_sid': self.account_sid,
            'idempotency_token': self.idempotency_token,
            'kore_signature': self.kore_signature,
            'webhook_received_at': self.webhook_received_at.isoformat() if self.webhook_received_at else None,
            'remote_addr': self.remote_addr,
        }
