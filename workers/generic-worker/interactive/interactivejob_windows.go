package interactive

type InteractiveInnerType = *ConPty
type InteractiveCmdType = *ConPty

func (itj *InteractiveJob) Setup(pty InteractiveCmdType) {
	itj.inner = pty

	go func() {
		itj.errors <- itj.inner.Wait(itj.ctx)
		close(itj.done)
	}()
}

func (itj *InteractiveJob) resizePty(width uint16, height uint16) error {
	return itj.inner.Resize(int(width), int(height))
}

func (itj *InteractiveJob) readPty(buf []byte) (int, error) {
	return itj.inner.Read(buf)
}

func (itj *InteractiveJob) writePty(buf []byte) (int, error) {
	return itj.inner.Write(buf)
}

func (itj *InteractiveJob) terminate() error {
	return itj.inner.Close()
}
