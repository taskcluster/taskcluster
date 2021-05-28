//! Support for claiming jobs.  This forms the core of any worker implementation, which must only
//! supply an executor to execute the claimed tasks.

mod long_poll;
mod task_claim;
mod work_claimer;

pub(crate) use task_claim::TaskClaim;
pub use work_claimer::WorkClaimer;
