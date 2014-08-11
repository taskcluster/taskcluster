# Stream API Design

	- Each stream must be based on a ReadClose


Ideas:

Keep two buffers around one for reading one for writing each buffer will
exist at some largish offset relative to human perceivable logs (16k?)
